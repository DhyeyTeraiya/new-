"""
Advanced Element Detection Model for Browser AI Agent
Combines Computer Vision + NLP for superior element identification
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
from transformers import (
    AutoModel, AutoTokenizer, 
    CLIPModel, CLIPProcessor,
    ViTModel, ViTImageProcessor
)
from typing import Dict, List, Tuple, Optional, Any
import cv2
import numpy as np
from PIL import Image
import json
from dataclasses import dataclass
from loguru import logger

@dataclass
class ElementPrediction:
    """Element detection prediction with confidence scores"""
    element_type: str
    bounding_box: Tuple[int, int, int, int]  # x, y, width, height
    confidence: float
    selector_suggestions: List[str]
    reasoning: str
    visual_features: Optional[np.ndarray] = None
    text_features: Optional[np.ndarray] = None

@dataclass
class TrainingExample:
    """Training example for element detection"""
    screenshot: np.ndarray
    dom_html: str
    target_description: str
    ground_truth_bbox: Tuple[int, int, int, int]
    element_type: str
    css_selector: str
    xpath_selector: str
    success: bool

class MultiModalElementDetector(nn.Module):
    """
    Advanced multi-modal element detector combining:
    1. Computer Vision (ViT) for screenshot analysis
    2. NLP (BERT) for text understanding
    3. DOM structure analysis
    4. Selector generation
    """
    
    def __init__(
        self,
        vision_model_name: str = "google/vit-base-patch16-224",
        text_model_name: str = "microsoft/codebert-base",
        clip_model_name: str = "openai/clip-vit-base-patch32",
        num_element_types: int = 20,
        hidden_dim: int = 768,
        dropout: float = 0.1
    ):
        super().__init__()
        
        # Vision Models
        self.vit_model = ViTModel.from_pretrained(vision_model_name)
        self.vit_processor = ViTImageProcessor.from_pretrained(vision_model_name)
        
        # CLIP for vision-text alignment
        self.clip_model = CLIPModel.from_pretrained(clip_model_name)
        self.clip_processor = CLIPProcessor.from_pretrained(clip_model_name)
        
        # Text/Code Models
        self.text_model = AutoModel.from_pretrained(text_model_name)
        self.text_tokenizer = AutoTokenizer.from_pretrained(text_model_name)
        
        # Feature dimensions
        self.vision_dim = self.vit_model.config.hidden_size
        self.text_dim = self.text_model.config.hidden_size
        self.clip_dim = self.clip_model.config.projection_dim
        
        # Fusion layers
        self.vision_projection = nn.Linear(self.vision_dim, hidden_dim)
        self.text_projection = nn.Linear(self.text_dim, hidden_dim)
        self.clip_projection = nn.Linear(self.clip_dim, hidden_dim)
        
        # Multi-head attention for feature fusion
        self.cross_attention = nn.MultiheadAttention(
            embed_dim=hidden_dim,
            num_heads=8,
            dropout=dropout,
            batch_first=True
        )
        
        # Classification heads
        self.element_type_classifier = nn.Sequential(
            nn.Linear(hidden_dim * 3, hidden_dim),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(hidden_dim, num_element_types)
        )
        
        # Bounding box regression
        self.bbox_regressor = nn.Sequential(
            nn.Linear(hidden_dim * 3, hidden_dim),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(hidden_dim, 4)  # x, y, width, height
        )
        
        # Confidence scorer
        self.confidence_scorer = nn.Sequential(
            nn.Linear(hidden_dim * 3, hidden_dim // 2),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(hidden_dim // 2, 1),
            nn.Sigmoid()
        )
        
        # Selector generation (simplified)
        self.selector_generator = nn.Sequential(
            nn.Linear(hidden_dim * 3, hidden_dim),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(hidden_dim, 512)  # Selector embedding
        )
        
        self.dropout = nn.Dropout(dropout)
        
        # Element type mapping
        self.element_types = [
            'button', 'input', 'link', 'text', 'image', 'form', 'select',
            'checkbox', 'radio', 'textarea', 'div', 'span', 'table',
            'list', 'nav', 'header', 'footer', 'modal', 'menu', 'other'
        ]
        
        logger.info(f"Initialized MultiModalElementDetector with {num_element_types} element types")
    
    def encode_screenshot(self, screenshot: np.ndarray) -> torch.Tensor:
        """Encode screenshot using ViT"""
        # Convert to PIL Image
        if isinstance(screenshot, np.ndarray):
            screenshot = Image.fromarray(screenshot)
        
        # Process with ViT
        inputs = self.vit_processor(screenshot, return_tensors="pt")
        with torch.no_grad():
            outputs = self.vit_model(**inputs)
            vision_features = outputs.last_hidden_state.mean(dim=1)  # Global average pooling
        
        return self.vision_projection(vision_features)
    
    def encode_text_description(self, description: str, dom_context: str = "") -> torch.Tensor:
        """Encode text description and DOM context"""
        # Combine description with DOM context
        full_text = f"Find element: {description}. Context: {dom_context[:500]}"
        
        # Tokenize and encode
        inputs = self.text_tokenizer(
            full_text,
            return_tensors="pt",
            max_length=512,
            truncation=True,
            padding=True
        )
        
        with torch.no_grad():
            outputs = self.text_model(**inputs)
            text_features = outputs.last_hidden_state.mean(dim=1)  # Global average pooling
        
        return self.text_projection(text_features)
    
    def encode_clip_features(self, screenshot: np.ndarray, description: str) -> torch.Tensor:
        """Encode using CLIP for vision-text alignment"""
        # Convert screenshot to PIL
        if isinstance(screenshot, np.ndarray):
            screenshot = Image.fromarray(screenshot)
        
        # Process with CLIP
        inputs = self.clip_processor(
            text=[description],
            images=[screenshot],
            return_tensors="pt",
            padding=True
        )
        
        with torch.no_grad():
            outputs = self.clip_model(**inputs)
            # Use image features for now
            clip_features = outputs.image_embeds
        
        return self.clip_projection(clip_features)
    
    def forward(
        self,
        screenshot: torch.Tensor,
        description: str,
        dom_context: str = ""
    ) -> Dict[str, torch.Tensor]:
        """Forward pass through the model"""
        
        # Encode different modalities
        vision_features = self.encode_screenshot(screenshot)
        text_features = self.encode_text_description(description, dom_context)
        clip_features = self.encode_clip_features(screenshot, description)
        
        # Cross-attention fusion
        combined_features = torch.cat([vision_features, text_features, clip_features], dim=1)
        
        # Apply cross-attention (simplified)
        attended_features, _ = self.cross_attention(
            combined_features, combined_features, combined_features
        )
        
        # Final feature representation
        final_features = self.dropout(attended_features.mean(dim=1))
        
        # Predictions
        element_type_logits = self.element_type_classifier(final_features)
        bbox_coords = self.bbox_regressor(final_features)
        confidence = self.confidence_scorer(final_features)
        selector_embedding = self.selector_generator(final_features)
        
        return {
            'element_type_logits': element_type_logits,
            'bbox_coords': bbox_coords,
            'confidence': confidence,
            'selector_embedding': selector_embedding,
            'features': final_features
        }
    
    def predict_element(
        self,
        screenshot: np.ndarray,
        description: str,
        dom_html: str = ""
    ) -> ElementPrediction:
        """Predict element location and properties"""
        
        self.eval()
        with torch.no_grad():
            # Forward pass
            outputs = self.forward(screenshot, description, dom_html)
            
            # Get predictions
            element_type_probs = F.softmax(outputs['element_type_logits'], dim=-1)
            element_type_idx = torch.argmax(element_type_probs, dim=-1).item()
            element_type = self.element_types[element_type_idx]
            
            # Bounding box (normalize to image dimensions)
            bbox_coords = outputs['bbox_coords'].squeeze().cpu().numpy()
            h, w = screenshot.shape[:2]
            bbox = (
                int(bbox_coords[0] * w),  # x
                int(bbox_coords[1] * h),  # y
                int(bbox_coords[2] * w),  # width
                int(bbox_coords[3] * h)   # height
            )
            
            confidence = outputs['confidence'].item()
            
            # Generate selector suggestions (simplified)
            selector_suggestions = self._generate_selectors(
                element_type, bbox, dom_html
            )
            
            # Generate reasoning
            reasoning = f"Detected {element_type} with {confidence:.2f} confidence based on visual and textual features"
            
            return ElementPrediction(
                element_type=element_type,
                bounding_box=bbox,
                confidence=confidence,
                selector_suggestions=selector_suggestions,
                reasoning=reasoning,
                visual_features=outputs['features'].cpu().numpy(),
            )
    
    def _generate_selectors(
        self,
        element_type: str,
        bbox: Tuple[int, int, int, int],
        dom_html: str
    ) -> List[str]:
        """Generate CSS/XPath selectors based on predictions"""
        
        selectors = []
        
        # Basic type-based selectors
        if element_type == 'button':
            selectors.extend([
                'button',
                'input[type="button"]',
                'input[type="submit"]',
                '[role="button"]'
            ])
        elif element_type == 'input':
            selectors.extend([
                'input[type="text"]',
                'input[type="email"]',
                'input[type="password"]',
                'textarea'
            ])
        elif element_type == 'link':
            selectors.extend([
                'a[href]',
                '[role="link"]'
            ])
        
        # Add position-based selectors
        x, y, w, h = bbox
        selectors.append(f'*[style*="position"][style*="{x}px"][style*="{y}px"]')
        
        # TODO: Add DOM analysis for more specific selectors
        
        return selectors[:5]  # Return top 5 suggestions

class ElementDetectorTrainer:
    """Training pipeline for the element detector"""
    
    def __init__(
        self,
        model: MultiModalElementDetector,
        learning_rate: float = 1e-4,
        weight_decay: float = 1e-5,
        device: str = "cuda" if torch.cuda.is_available() else "cpu"
    ):
        self.model = model.to(device)
        self.device = device
        
        # Optimizer
        self.optimizer = torch.optim.AdamW(
            self.model.parameters(),
            lr=learning_rate,
            weight_decay=weight_decay
        )
        
        # Loss functions
        self.classification_loss = nn.CrossEntropyLoss()
        self.bbox_loss = nn.SmoothL1Loss()
        self.confidence_loss = nn.BCELoss()
        
        # Metrics tracking
        self.training_metrics = {
            'total_loss': [],
            'classification_loss': [],
            'bbox_loss': [],
            'confidence_loss': [],
            'accuracy': []
        }
        
        logger.info(f"Initialized trainer on device: {device}")
    
    def compute_loss(
        self,
        outputs: Dict[str, torch.Tensor],
        targets: Dict[str, torch.Tensor]
    ) -> Dict[str, torch.Tensor]:
        """Compute multi-task loss"""
        
        # Classification loss
        cls_loss = self.classification_loss(
            outputs['element_type_logits'],
            targets['element_type']
        )
        
        # Bounding box regression loss
        bbox_loss = self.bbox_loss(
            outputs['bbox_coords'],
            targets['bbox_coords']
        )
        
        # Confidence loss
        conf_loss = self.confidence_loss(
            outputs['confidence'],
            targets['confidence']
        )
        
        # Combined loss with weights
        total_loss = cls_loss + 2.0 * bbox_loss + 0.5 * conf_loss
        
        return {
            'total_loss': total_loss,
            'classification_loss': cls_loss,
            'bbox_loss': bbox_loss,
            'confidence_loss': conf_loss
        }
    
    def train_step(
        self,
        batch: Dict[str, torch.Tensor]
    ) -> Dict[str, float]:
        """Single training step"""
        
        self.model.train()
        self.optimizer.zero_grad()
        
        # Forward pass
        outputs = self.model(
            batch['screenshot'],
            batch['description'],
            batch['dom_context']
        )
        
        # Compute loss
        losses = self.compute_loss(outputs, batch['targets'])
        
        # Backward pass
        losses['total_loss'].backward()
        torch.nn.utils.clip_grad_norm_(self.model.parameters(), max_norm=1.0)
        self.optimizer.step()
        
        # Compute accuracy
        predictions = torch.argmax(outputs['element_type_logits'], dim=-1)
        accuracy = (predictions == batch['targets']['element_type']).float().mean()
        
        # Return metrics
        return {
            'total_loss': losses['total_loss'].item(),
            'classification_loss': losses['classification_loss'].item(),
            'bbox_loss': losses['bbox_loss'].item(),
            'confidence_loss': losses['confidence_loss'].item(),
            'accuracy': accuracy.item()
        }
    
    def train_epoch(self, dataloader) -> Dict[str, float]:
        """Train for one epoch"""
        
        epoch_metrics = {
            'total_loss': 0.0,
            'classification_loss': 0.0,
            'bbox_loss': 0.0,
            'confidence_loss': 0.0,
            'accuracy': 0.0
        }
        
        num_batches = len(dataloader)
        
        for batch_idx, batch in enumerate(dataloader):
            # Move batch to device
            batch = {k: v.to(self.device) if isinstance(v, torch.Tensor) else v 
                    for k, v in batch.items()}
            
            # Training step
            step_metrics = self.train_step(batch)
            
            # Accumulate metrics
            for key, value in step_metrics.items():
                epoch_metrics[key] += value
            
            # Log progress
            if batch_idx % 10 == 0:
                logger.info(
                    f"Batch {batch_idx}/{num_batches} - "
                    f"Loss: {step_metrics['total_loss']:.4f}, "
                    f"Acc: {step_metrics['accuracy']:.4f}"
                )
        
        # Average metrics
        for key in epoch_metrics:
            epoch_metrics[key] /= num_batches
        
        return epoch_metrics
    
    def validate(self, dataloader) -> Dict[str, float]:
        """Validate the model"""
        
        self.model.eval()
        val_metrics = {
            'total_loss': 0.0,
            'classification_loss': 0.0,
            'bbox_loss': 0.0,
            'confidence_loss': 0.0,
            'accuracy': 0.0
        }
        
        num_batches = len(dataloader)
        
        with torch.no_grad():
            for batch in dataloader:
                # Move batch to device
                batch = {k: v.to(self.device) if isinstance(v, torch.Tensor) else v 
                        for k, v in batch.items()}
                
                # Forward pass
                outputs = self.model(
                    batch['screenshot'],
                    batch['description'],
                    batch['dom_context']
                )
                
                # Compute loss
                losses = self.compute_loss(outputs, batch['targets'])
                
                # Compute accuracy
                predictions = torch.argmax(outputs['element_type_logits'], dim=-1)
                accuracy = (predictions == batch['targets']['element_type']).float().mean()
                
                # Accumulate metrics
                val_metrics['total_loss'] += losses['total_loss'].item()
                val_metrics['classification_loss'] += losses['classification_loss'].item()
                val_metrics['bbox_loss'] += losses['bbox_loss'].item()
                val_metrics['confidence_loss'] += losses['confidence_loss'].item()
                val_metrics['accuracy'] += accuracy.item()
        
        # Average metrics
        for key in val_metrics:
            val_metrics[key] /= num_batches
        
        return val_metrics
    
    def save_model(self, path: str):
        """Save model checkpoint"""
        torch.save({
            'model_state_dict': self.model.state_dict(),
            'optimizer_state_dict': self.optimizer.state_dict(),
            'training_metrics': self.training_metrics
        }, path)
        logger.info(f"Model saved to {path}")
    
    def load_model(self, path: str):
        """Load model checkpoint"""
        checkpoint = torch.load(path, map_location=self.device)
        self.model.load_state_dict(checkpoint['model_state_dict'])
        self.optimizer.load_state_dict(checkpoint['optimizer_state_dict'])
        self.training_metrics = checkpoint.get('training_metrics', {})
        logger.info(f"Model loaded from {path}")

# Example usage and testing
if __name__ == "__main__":
    # Initialize model
    model = MultiModalElementDetector()
    trainer = ElementDetectorTrainer(model)
    
    # Create dummy data for testing
    dummy_screenshot = np.random.randint(0, 255, (800, 1200, 3), dtype=np.uint8)
    dummy_description = "Find the login button"
    dummy_dom = "<html><body><button id='login'>Login</button></body></html>"
    
    # Test prediction
    prediction = model.predict_element(dummy_screenshot, dummy_description, dummy_dom)
    
    logger.info(f"Test prediction: {prediction}")
    logger.info("Element detector model initialized successfully!")