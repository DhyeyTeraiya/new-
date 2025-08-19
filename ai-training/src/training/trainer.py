"""
Complete Training Pipeline for Browser AI Agent
Includes data loading, model training, evaluation, and deployment
"""

import os
import json
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
import numpy as np
from PIL import Image
import cv2
from typing import Dict, List, Tuple, Optional, Any
from pathlib import Path
import sqlite3
from dataclasses import dataclass
import wandb
from loguru import logger
from tqdm import tqdm
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.metrics import classification_report, confusion_matrix
import optuna
from transformers import get_linear_schedule_with_warmup
import albumentations as A
from albumentations.pytorch import ToTensorV2

from ..models.element_detector import MultiModalElementDetector, ElementDetectorTrainer
from ..data.data_collector import InteractionData

@dataclass
class TrainingConfig:
    """Training configuration"""
    # Model parameters
    vision_model_name: str = "google/vit-base-patch16-224"
    text_model_name: str = "microsoft/codebert-base"
    clip_model_name: str = "openai/clip-vit-base-patch32"
    num_element_types: int = 20
    hidden_dim: int = 768
    dropout: float = 0.1
    
    # Training parameters
    batch_size: int = 16
    learning_rate: float = 1e-4
    weight_decay: float = 1e-5
    num_epochs: int = 50
    warmup_steps: int = 1000
    gradient_clip_norm: float = 1.0
    
    # Data parameters
    train_split: float = 0.8
    val_split: float = 0.1
    test_split: float = 0.1
    max_sequence_length: int = 512
    image_size: Tuple[int, int] = (224, 224)
    
    # Augmentation parameters
    use_augmentation: bool = True
    augmentation_prob: float = 0.5
    
    # Optimization parameters
    use_mixed_precision: bool = True
    accumulation_steps: int = 1
    
    # Logging and checkpointing
    log_interval: int = 100
    save_interval: int = 1000
    use_wandb: bool = True
    project_name: str = "browser-ai-agent"
    
    # Paths
    data_dir: str = "./training_data"
    output_dir: str = "./models"
    checkpoint_dir: str = "./checkpoints"

class ElementDetectionDataset(Dataset):
    """Dataset for element detection training"""
    
    def __init__(
        self,
        data_path: str,
        split: str = "train",
        config: TrainingConfig = None,
        transform: Optional[A.Compose] = None
    ):
        self.data_path = Path(data_path)
        self.split = split
        self.config = config or TrainingConfig()
        self.transform = transform
        
        # Load data from database
        self.interactions = self.load_interactions()
        
        # Element type mapping
        self.element_types = [
            'button', 'input', 'link', 'text', 'image', 'form', 'select',
            'checkbox', 'radio', 'textarea', 'div', 'span', 'table',
            'list', 'nav', 'header', 'footer', 'modal', 'menu', 'other'
        ]
        self.type_to_idx = {t: i for i, t in enumerate(self.element_types)}
        
        logger.info(f"Loaded {len(self.interactions)} interactions for {split} split")
    
    def load_interactions(self) -> List[InteractionData]:
        """Load interactions from database"""
        db_path = self.data_path / "training_data.db"
        
        if not db_path.exists():
            logger.error(f"Database not found: {db_path}")
            return []
        
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Load all interactions
        cursor.execute("""
            SELECT * FROM interactions 
            WHERE success = 1 AND screenshot_path IS NOT NULL
            ORDER BY timestamp
        """)
        
        rows = cursor.fetchall()
        conn.close()
        
        interactions = []
        for row in rows:
            try:
                # Parse the row data
                interaction = InteractionData(
                    timestamp=row[1],
                    url=row[2],
                    page_title=row[3] or '',
                    user_description=row[4] or '',
                    element_type=row[5] or 'other',
                    element_text=row[6] or '',
                    element_attributes=json.loads(row[7]) if row[7] else {},
                    css_selector=row[8] or '',
                    xpath_selector=row[9] or '',
                    bounding_box=tuple(json.loads(row[10])) if row[10] else (0, 0, 0, 0),
                    screenshot_path=row[11] or '',
                    dom_html=row[12] or '',
                    success=bool(row[13]),
                    interaction_type=row[14] or 'click',
                    context_elements=json.loads(row[15]) if row[15] else [],
                    page_metadata=json.loads(row[16]) if row[16] else {}
                )
                
                # Validate that screenshot exists
                screenshot_path = self.data_path / "screenshots" / interaction.screenshot_path
                if screenshot_path.exists():
                    interactions.append(interaction)
                    
            except Exception as e:
                logger.debug(f"Error parsing interaction: {e}")
                continue
        
        # Split data
        total_size = len(interactions)
        train_size = int(total_size * self.config.train_split)
        val_size = int(total_size * self.config.val_split)
        
        if self.split == "train":
            return interactions[:train_size]
        elif self.split == "val":
            return interactions[train_size:train_size + val_size]
        else:  # test
            return interactions[train_size + val_size:]
    
    def __len__(self) -> int:
        return len(self.interactions)
    
    def __getitem__(self, idx: int) -> Dict[str, Any]:
        interaction = self.interactions[idx]
        
        # Load screenshot
        screenshot_path = self.data_path / "screenshots" / interaction.screenshot_path
        try:
            screenshot = cv2.imread(str(screenshot_path))
            screenshot = cv2.cvtColor(screenshot, cv2.COLOR_BGR2RGB)
        except:
            # Fallback to dummy image
            screenshot = np.zeros((224, 224, 3), dtype=np.uint8)
        
        # Apply augmentations
        if self.transform:
            augmented = self.transform(image=screenshot)
            screenshot = augmented['image']
        else:
            screenshot = torch.from_numpy(screenshot).permute(2, 0, 1).float() / 255.0
        
        # Prepare text data
        description = interaction.user_description
        dom_context = interaction.dom_html[:1000]  # Truncate DOM
        
        # Prepare targets
        element_type_idx = self.type_to_idx.get(interaction.element_type, len(self.element_types) - 1)
        
        # Normalize bounding box coordinates
        h, w = screenshot.shape[1], screenshot.shape[2]
        x, y, bbox_w, bbox_h = interaction.bounding_box
        normalized_bbox = torch.tensor([
            x / w if w > 0 else 0,
            y / h if h > 0 else 0,
            bbox_w / w if w > 0 else 0,
            bbox_h / h if h > 0 else 0
        ], dtype=torch.float32)
        
        # Confidence (1.0 for successful interactions)
        confidence = torch.tensor([1.0], dtype=torch.float32)
        
        return {
            'screenshot': screenshot,
            'description': description,
            'dom_context': dom_context,
            'targets': {
                'element_type': torch.tensor(element_type_idx, dtype=torch.long),
                'bbox_coords': normalized_bbox,
                'confidence': confidence
            },
            'metadata': {
                'url': interaction.url,
                'element_text': interaction.element_text,
                'css_selector': interaction.css_selector
            }
        }

class AdvancedTrainer:
    """Advanced training pipeline with hyperparameter optimization"""
    
    def __init__(self, config: TrainingConfig):
        self.config = config
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        
        # Create directories
        Path(config.output_dir).mkdir(exist_ok=True)
        Path(config.checkpoint_dir).mkdir(exist_ok=True)
        
        # Initialize wandb
        if config.use_wandb:
            wandb.init(
                project=config.project_name,
                config=config.__dict__,
                name=f"element-detector-{config.learning_rate}-{config.batch_size}"
            )
        
        # Data augmentation
        self.train_transform = self.get_train_transforms()
        self.val_transform = self.get_val_transforms()
        
        logger.info(f"Trainer initialized on device: {self.device}")
    
    def get_train_transforms(self) -> A.Compose:
        """Get training augmentations"""
        transforms = [
            A.Resize(self.config.image_size[0], self.config.image_size[1]),
        ]
        
        if self.config.use_augmentation:
            transforms.extend([
                A.HorizontalFlip(p=0.3),
                A.RandomBrightnessContrast(p=0.3),
                A.HueSaturationValue(p=0.3),
                A.RandomGamma(p=0.3),
                A.GaussNoise(p=0.2),
                A.Blur(blur_limit=3, p=0.2),
            ])
        
        transforms.append(A.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]))
        transforms.append(ToTensorV2())
        
        return A.Compose(transforms)
    
    def get_val_transforms(self) -> A.Compose:
        """Get validation transforms"""
        return A.Compose([
            A.Resize(self.config.image_size[0], self.config.image_size[1]),
            A.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
            ToTensorV2()
        ])
    
    def create_dataloaders(self) -> Tuple[DataLoader, DataLoader, DataLoader]:
        """Create train, validation, and test dataloaders"""
        
        # Create datasets
        train_dataset = ElementDetectionDataset(
            self.config.data_dir, 
            split="train", 
            config=self.config,
            transform=self.train_transform
        )
        
        val_dataset = ElementDetectionDataset(
            self.config.data_dir, 
            split="val", 
            config=self.config,
            transform=self.val_transform
        )
        
        test_dataset = ElementDetectionDataset(
            self.config.data_dir, 
            split="test", 
            config=self.config,
            transform=self.val_transform
        )
        
        # Create dataloaders
        train_loader = DataLoader(
            train_dataset,
            batch_size=self.config.batch_size,
            shuffle=True,
            num_workers=4,
            pin_memory=True,
            drop_last=True
        )
        
        val_loader = DataLoader(
            val_dataset,
            batch_size=self.config.batch_size,
            shuffle=False,
            num_workers=4,
            pin_memory=True
        )
        
        test_loader = DataLoader(
            test_dataset,
            batch_size=self.config.batch_size,
            shuffle=False,
            num_workers=4,
            pin_memory=True
        )
        
        return train_loader, val_loader, test_loader
    
    def train(self) -> Dict[str, float]:
        """Main training loop"""
        
        # Create model
        model = MultiModalElementDetector(
            vision_model_name=self.config.vision_model_name,
            text_model_name=self.config.text_model_name,
            clip_model_name=self.config.clip_model_name,
            num_element_types=self.config.num_element_types,
            hidden_dim=self.config.hidden_dim,
            dropout=self.config.dropout
        )
        
        # Create trainer
        trainer = ElementDetectorTrainer(
            model=model,
            learning_rate=self.config.learning_rate,
            weight_decay=self.config.weight_decay,
            device=self.device
        )
        
        # Create dataloaders
        train_loader, val_loader, test_loader = self.create_dataloaders()
        
        # Learning rate scheduler
        total_steps = len(train_loader) * self.config.num_epochs
        scheduler = get_linear_schedule_with_warmup(
            trainer.optimizer,
            num_warmup_steps=self.config.warmup_steps,
            num_training_steps=total_steps
        )
        
        # Mixed precision training
        scaler = torch.cuda.amp.GradScaler() if self.config.use_mixed_precision else None
        
        # Training loop
        best_val_loss = float('inf')
        patience_counter = 0
        patience = 10
        
        for epoch in range(self.config.num_epochs):
            logger.info(f"Epoch {epoch + 1}/{self.config.num_epochs}")
            
            # Training
            train_metrics = self.train_epoch(trainer, train_loader, scheduler, scaler)
            
            # Validation
            val_metrics = self.validate_epoch(trainer, val_loader)
            
            # Logging
            self.log_metrics(epoch, train_metrics, val_metrics)
            
            # Save checkpoint
            if val_metrics['total_loss'] < best_val_loss:
                best_val_loss = val_metrics['total_loss']
                patience_counter = 0
                
                checkpoint_path = Path(self.config.checkpoint_dir) / "best_model.pt"
                trainer.save_model(str(checkpoint_path))
                logger.info(f"New best model saved with val_loss: {best_val_loss:.4f}")
            else:
                patience_counter += 1
            
            # Early stopping
            if patience_counter >= patience:
                logger.info(f"Early stopping after {epoch + 1} epochs")
                break
        
        # Final evaluation
        test_metrics = self.evaluate_model(trainer, test_loader)
        
        # Save final model
        final_model_path = Path(self.config.output_dir) / "final_model.pt"
        trainer.save_model(str(final_model_path))
        
        return test_metrics
    
    def train_epoch(
        self, 
        trainer: ElementDetectorTrainer, 
        dataloader: DataLoader,
        scheduler,
        scaler
    ) -> Dict[str, float]:
        """Train for one epoch"""
        
        trainer.model.train()
        epoch_metrics = {
            'total_loss': 0.0,
            'classification_loss': 0.0,
            'bbox_loss': 0.0,
            'confidence_loss': 0.0,
            'accuracy': 0.0
        }
        
        progress_bar = tqdm(dataloader, desc="Training")
        
        for batch_idx, batch in enumerate(progress_bar):
            # Move to device
            batch = self.move_batch_to_device(batch)
            
            # Forward pass with mixed precision
            if scaler:
                with torch.cuda.amp.autocast():
                    step_metrics = trainer.train_step(batch)
            else:
                step_metrics = trainer.train_step(batch)
            
            # Update scheduler
            scheduler.step()
            
            # Accumulate metrics
            for key, value in step_metrics.items():
                epoch_metrics[key] += value
            
            # Update progress bar
            progress_bar.set_postfix({
                'loss': step_metrics['total_loss'],
                'acc': step_metrics['accuracy']
            })
            
            # Log intermediate results
            if batch_idx % self.config.log_interval == 0:
                if self.config.use_wandb:
                    wandb.log({
                        f"train/{key}": value for key, value in step_metrics.items()
                    })
        
        # Average metrics
        for key in epoch_metrics:
            epoch_metrics[key] /= len(dataloader)
        
        return epoch_metrics
    
    def validate_epoch(
        self, 
        trainer: ElementDetectorTrainer, 
        dataloader: DataLoader
    ) -> Dict[str, float]:
        """Validate for one epoch"""
        
        trainer.model.eval()
        val_metrics = {
            'total_loss': 0.0,
            'classification_loss': 0.0,
            'bbox_loss': 0.0,
            'confidence_loss': 0.0,
            'accuracy': 0.0
        }
        
        all_predictions = []
        all_targets = []
        
        with torch.no_grad():
            for batch in tqdm(dataloader, desc="Validation"):
                batch = self.move_batch_to_device(batch)
                
                # Forward pass
                outputs = trainer.model(
                    batch['screenshot'],
                    batch['description'],
                    batch['dom_context']
                )
                
                # Compute loss
                losses = trainer.compute_loss(outputs, batch['targets'])
                
                # Compute accuracy
                predictions = torch.argmax(outputs['element_type_logits'], dim=-1)
                accuracy = (predictions == batch['targets']['element_type']).float().mean()
                
                # Accumulate metrics
                val_metrics['total_loss'] += losses['total_loss'].item()
                val_metrics['classification_loss'] += losses['classification_loss'].item()
                val_metrics['bbox_loss'] += losses['bbox_loss'].item()
                val_metrics['confidence_loss'] += losses['confidence_loss'].item()
                val_metrics['accuracy'] += accuracy.item()
                
                # Store for detailed analysis
                all_predictions.extend(predictions.cpu().numpy())
                all_targets.extend(batch['targets']['element_type'].cpu().numpy())
        
        # Average metrics
        for key in val_metrics:
            val_metrics[key] /= len(dataloader)
        
        # Generate classification report
        if len(all_predictions) > 0:
            element_types = [
                'button', 'input', 'link', 'text', 'image', 'form', 'select',
                'checkbox', 'radio', 'textarea', 'div', 'span', 'table',
                'list', 'nav', 'header', 'footer', 'modal', 'menu', 'other'
            ]
            
            report = classification_report(
                all_targets, 
                all_predictions, 
                target_names=element_types[:len(set(all_targets))],
                output_dict=True,
                zero_division=0
            )
            
            val_metrics['f1_score'] = report['weighted avg']['f1-score']
            val_metrics['precision'] = report['weighted avg']['precision']
            val_metrics['recall'] = report['weighted avg']['recall']
        
        return val_metrics
    
    def evaluate_model(
        self, 
        trainer: ElementDetectorTrainer, 
        dataloader: DataLoader
    ) -> Dict[str, float]:
        """Comprehensive model evaluation"""
        
        logger.info("Running comprehensive evaluation...")
        
        # Load best model
        checkpoint_path = Path(self.config.checkpoint_dir) / "best_model.pt"
        if checkpoint_path.exists():
            trainer.load_model(str(checkpoint_path))
        
        # Run validation
        test_metrics = self.validate_epoch(trainer, dataloader)
        
        # Additional evaluation metrics
        test_metrics.update(self.compute_additional_metrics(trainer, dataloader))
        
        logger.info("Evaluation Results:")
        for key, value in test_metrics.items():
            logger.info(f"  {key}: {value:.4f}")
        
        return test_metrics
    
    def compute_additional_metrics(
        self, 
        trainer: ElementDetectorTrainer, 
        dataloader: DataLoader
    ) -> Dict[str, float]:
        """Compute additional evaluation metrics"""
        
        trainer.model.eval()
        
        bbox_ious = []
        confidence_scores = []
        
        with torch.no_grad():
            for batch in dataloader:
                batch = self.move_batch_to_device(batch)
                
                outputs = trainer.model(
                    batch['screenshot'],
                    batch['description'],
                    batch['dom_context']
                )
                
                # Compute IoU for bounding boxes
                pred_bbox = outputs['bbox_coords']
                true_bbox = batch['targets']['bbox_coords']
                
                ious = self.compute_iou(pred_bbox, true_bbox)
                bbox_ious.extend(ious.cpu().numpy())
                
                # Collect confidence scores
                confidence_scores.extend(outputs['confidence'].cpu().numpy())
        
        return {
            'mean_iou': np.mean(bbox_ious),
            'mean_confidence': np.mean(confidence_scores),
            'iou_at_50': np.mean(np.array(bbox_ious) > 0.5),
            'iou_at_75': np.mean(np.array(bbox_ious) > 0.75)
        }
    
    def compute_iou(self, pred_bbox: torch.Tensor, true_bbox: torch.Tensor) -> torch.Tensor:
        """Compute IoU between predicted and true bounding boxes"""
        
        # Convert from center format to corner format if needed
        pred_x1 = pred_bbox[:, 0] - pred_bbox[:, 2] / 2
        pred_y1 = pred_bbox[:, 1] - pred_bbox[:, 3] / 2
        pred_x2 = pred_bbox[:, 0] + pred_bbox[:, 2] / 2
        pred_y2 = pred_bbox[:, 1] + pred_bbox[:, 3] / 2
        
        true_x1 = true_bbox[:, 0] - true_bbox[:, 2] / 2
        true_y1 = true_bbox[:, 1] - true_bbox[:, 3] / 2
        true_x2 = true_bbox[:, 0] + true_bbox[:, 2] / 2
        true_y2 = true_bbox[:, 1] + true_bbox[:, 3] / 2
        
        # Compute intersection
        inter_x1 = torch.max(pred_x1, true_x1)
        inter_y1 = torch.max(pred_y1, true_y1)
        inter_x2 = torch.min(pred_x2, true_x2)
        inter_y2 = torch.min(pred_y2, true_y2)
        
        inter_area = torch.clamp(inter_x2 - inter_x1, min=0) * torch.clamp(inter_y2 - inter_y1, min=0)
        
        # Compute union
        pred_area = (pred_x2 - pred_x1) * (pred_y2 - pred_y1)
        true_area = (true_x2 - true_x1) * (true_y2 - true_y1)
        union_area = pred_area + true_area - inter_area
        
        # Compute IoU
        iou = inter_area / (union_area + 1e-6)
        
        return iou
    
    def move_batch_to_device(self, batch: Dict[str, Any]) -> Dict[str, Any]:
        """Move batch to device"""
        
        device_batch = {}
        
        for key, value in batch.items():
            if key == 'targets':
                device_batch[key] = {
                    k: v.to(self.device) if isinstance(v, torch.Tensor) else v
                    for k, v in value.items()
                }
            elif isinstance(value, torch.Tensor):
                device_batch[key] = value.to(self.device)
            else:
                device_batch[key] = value
        
        return device_batch
    
    def log_metrics(self, epoch: int, train_metrics: Dict[str, float], val_metrics: Dict[str, float]):
        """Log training metrics"""
        
        logger.info(f"Epoch {epoch + 1} Results:")
        logger.info(f"  Train Loss: {train_metrics['total_loss']:.4f}, Acc: {train_metrics['accuracy']:.4f}")
        logger.info(f"  Val Loss: {val_metrics['total_loss']:.4f}, Acc: {val_metrics['accuracy']:.4f}")
        
        if self.config.use_wandb:
            wandb.log({
                'epoch': epoch,
                **{f'train/{k}': v for k, v in train_metrics.items()},
                **{f'val/{k}': v for k, v in val_metrics.items()}
            })

class HyperparameterOptimizer:
    """Hyperparameter optimization using Optuna"""
    
    def __init__(self, base_config: TrainingConfig, n_trials: int = 50):
        self.base_config = base_config
        self.n_trials = n_trials
    
    def objective(self, trial: optuna.Trial) -> float:
        """Optuna objective function"""
        
        # Suggest hyperparameters
        config = TrainingConfig(
            learning_rate=trial.suggest_float('learning_rate', 1e-5, 1e-3, log=True),
            batch_size=trial.suggest_categorical('batch_size', [8, 16, 32]),
            dropout=trial.suggest_float('dropout', 0.1, 0.5),
            hidden_dim=trial.suggest_categorical('hidden_dim', [512, 768, 1024]),
            weight_decay=trial.suggest_float('weight_decay', 1e-6, 1e-4, log=True),
            
            # Keep other parameters from base config
            **{k: v for k, v in self.base_config.__dict__.items() 
               if k not in ['learning_rate', 'batch_size', 'dropout', 'hidden_dim', 'weight_decay']}
        )
        
        # Reduce epochs for faster optimization
        config.num_epochs = 10
        config.use_wandb = False
        
        try:
            # Train model
            trainer = AdvancedTrainer(config)
            test_metrics = trainer.train()
            
            # Return validation accuracy as objective
            return test_metrics.get('accuracy', 0.0)
            
        except Exception as e:
            logger.error(f"Trial failed: {e}")
            return 0.0
    
    def optimize(self) -> Dict[str, Any]:
        """Run hyperparameter optimization"""
        
        study = optuna.create_study(direction='maximize')
        study.optimize(self.objective, n_trials=self.n_trials)
        
        logger.info("Optimization completed!")
        logger.info(f"Best trial: {study.best_trial.value}")
        logger.info(f"Best params: {study.best_trial.params}")
        
        return study.best_trial.params

# Training script
def main():
    """Main training function"""
    
    # Configuration
    config = TrainingConfig(
        batch_size=16,
        learning_rate=1e-4,
        num_epochs=50,
        use_wandb=True,
        data_dir="./training_data",
        output_dir="./models",
        checkpoint_dir="./checkpoints"
    )
    
    # Run hyperparameter optimization (optional)
    optimize_hyperparams = False
    if optimize_hyperparams:
        optimizer = HyperparameterOptimizer(config, n_trials=20)
        best_params = optimizer.optimize()
        
        # Update config with best parameters
        for key, value in best_params.items():
            setattr(config, key, value)
    
    # Train model
    trainer = AdvancedTrainer(config)
    test_metrics = trainer.train()
    
    logger.info("Training completed!")
    logger.info(f"Final test metrics: {test_metrics}")

if __name__ == "__main__":
    main()