"""
Production Model Server for Browser AI Agent
FastAPI-based inference server with real-time predictions
"""

import asyncio
import json
import time
from typing import Dict, List, Optional, Any
import torch
import numpy as np
from PIL import Image
import cv2
import base64
from io import BytesIO
from pathlib import Path

from fastapi import FastAPI, HTTPException, UploadFile, File, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import uvicorn
from loguru import logger

from ..models.element_detector import MultiModalElementDetector, ElementPrediction
from ..training.trainer import TrainingConfig

# =============================================================================
# REQUEST/RESPONSE MODELS
# =============================================================================

class ElementDetectionRequest(BaseModel):
    """Request model for element detection"""
    screenshot_base64: str = Field(..., description="Base64 encoded screenshot")
    description: str = Field(..., description="Natural language description of element to find")
    dom_html: Optional[str] = Field(None, description="DOM HTML context")
    confidence_threshold: float = Field(0.5, description="Minimum confidence threshold")
    max_results: int = Field(5, description="Maximum number of results to return")

class BoundingBox(BaseModel):
    """Bounding box model"""
    x: int
    y: int
    width: int
    height: int

class ElementDetectionResult(BaseModel):
    """Single element detection result"""
    element_type: str
    bounding_box: BoundingBox
    confidence: float
    selector_suggestions: List[str]
    reasoning: str

class ElementDetectionResponse(BaseModel):
    """Response model for element detection"""
    success: bool
    results: List[ElementDetectionResult]
    processing_time_ms: float
    model_version: str
    error_message: Optional[str] = None

class BatchDetectionRequest(BaseModel):
    """Batch detection request"""
    requests: List[ElementDetectionRequest]
    parallel_processing: bool = True

class BatchDetectionResponse(BaseModel):
    """Batch detection response"""
    success: bool
    results: List[ElementDetectionResponse]
    total_processing_time_ms: float

class ModelHealthResponse(BaseModel):
    """Model health check response"""
    status: str
    model_loaded: bool
    gpu_available: bool
    memory_usage_mb: float
    uptime_seconds: float

# =============================================================================
# MODEL SERVER CLASS
# =============================================================================

class ModelServer:
    """Production model server"""
    
    def __init__(
        self,
        model_path: str,
        config_path: Optional[str] = None,
        device: str = "auto"
    ):
        self.model_path = Path(model_path)
        self.config_path = Path(config_path) if config_path else None
        
        # Device setup
        if device == "auto":
            self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        else:
            self.device = torch.device(device)
        
        # Model and config
        self.model: Optional[MultiModalElementDetector] = None
        self.config: Optional[TrainingConfig] = None
        
        # Server stats
        self.start_time = time.time()
        self.request_count = 0
        self.total_processing_time = 0.0
        
        # Load model
        self.load_model()
        
        logger.info(f"ModelServer initialized on device: {self.device}")
    
    def load_model(self):
        """Load the trained model"""
        try:
            # Load config if available
            if self.config_path and self.config_path.exists():
                with open(self.config_path, 'r') as f:
                    config_dict = json.load(f)
                self.config = TrainingConfig(**config_dict)
            else:
                self.config = TrainingConfig()
            
            # Initialize model
            self.model = MultiModalElementDetector(
                vision_model_name=self.config.vision_model_name,
                text_model_name=self.config.text_model_name,
                clip_model_name=self.config.clip_model_name,
                num_element_types=self.config.num_element_types,
                hidden_dim=self.config.hidden_dim,
                dropout=self.config.dropout
            )
            
            # Load weights
            if self.model_path.exists():
                checkpoint = torch.load(self.model_path, map_location=self.device)
                if 'model_state_dict' in checkpoint:
                    self.model.load_state_dict(checkpoint['model_state_dict'])
                else:
                    self.model.load_state_dict(checkpoint)
                
                logger.info(f"Model loaded from {self.model_path}")
            else:
                logger.warning(f"Model file not found: {self.model_path}")
                logger.info("Using randomly initialized model")
            
            # Move to device and set eval mode
            self.model.to(self.device)
            self.model.eval()
            
            # Warm up model
            self.warmup_model()
            
        except Exception as e:
            logger.error(f"Failed to load model: {e}")
            raise
    
    def warmup_model(self):
        """Warm up the model with dummy data"""
        try:
            dummy_screenshot = np.random.randint(0, 255, (224, 224, 3), dtype=np.uint8)
            dummy_description = "Find the login button"
            
            with torch.no_grad():
                _ = self.model.predict_element(dummy_screenshot, dummy_description)
            
            logger.info("Model warmed up successfully")
        except Exception as e:
            logger.warning(f"Model warmup failed: {e}")
    
    def decode_screenshot(self, screenshot_base64: str) -> np.ndarray:
        """Decode base64 screenshot to numpy array"""
        try:
            # Remove data URL prefix if present
            if screenshot_base64.startswith('data:image'):
                screenshot_base64 = screenshot_base64.split(',')[1]
            
            # Decode base64
            image_data = base64.b64decode(screenshot_base64)
            
            # Convert to PIL Image
            image = Image.open(BytesIO(image_data))
            
            # Convert to RGB if necessary
            if image.mode != 'RGB':
                image = image.convert('RGB')
            
            # Convert to numpy array
            screenshot = np.array(image)
            
            return screenshot
            
        except Exception as e:
            logger.error(f"Failed to decode screenshot: {e}")
            raise HTTPException(status_code=400, detail="Invalid screenshot format")
    
    async def predict_element(self, request: ElementDetectionRequest) -> ElementDetectionResponse:
        """Predict element location"""
        start_time = time.time()
        
        try:
            # Decode screenshot
            screenshot = self.decode_screenshot(request.screenshot_base64)
            
            # Run prediction
            with torch.no_grad():
                prediction = self.model.predict_element(
                    screenshot=screenshot,
                    description=request.description,
                    dom_html=request.dom_html or ""
                )
            
            # Filter by confidence threshold
            results = []
            if prediction.confidence >= request.confidence_threshold:
                result = ElementDetectionResult(
                    element_type=prediction.element_type,
                    bounding_box=BoundingBox(
                        x=prediction.bounding_box[0],
                        y=prediction.bounding_box[1],
                        width=prediction.bounding_box[2],
                        height=prediction.bounding_box[3]
                    ),
                    confidence=prediction.confidence,
                    selector_suggestions=prediction.selector_suggestions,
                    reasoning=prediction.reasoning
                )
                results.append(result)
            
            # Limit results
            results = results[:request.max_results]
            
            processing_time = (time.time() - start_time) * 1000
            
            # Update stats
            self.request_count += 1
            self.total_processing_time += processing_time
            
            return ElementDetectionResponse(
                success=True,
                results=results,
                processing_time_ms=processing_time,
                model_version="1.0.0"
            )
            
        except Exception as e:
            logger.error(f"Prediction failed: {e}")
            processing_time = (time.time() - start_time) * 1000
            
            return ElementDetectionResponse(
                success=False,
                results=[],
                processing_time_ms=processing_time,
                model_version="1.0.0",
                error_message=str(e)
            )
    
    async def predict_batch(self, request: BatchDetectionRequest) -> BatchDetectionResponse:
        """Batch prediction"""
        start_time = time.time()
        
        try:
            if request.parallel_processing:
                # Process in parallel
                tasks = [
                    self.predict_element(req) for req in request.requests
                ]
                results = await asyncio.gather(*tasks)
            else:
                # Process sequentially
                results = []
                for req in request.requests:
                    result = await self.predict_element(req)
                    results.append(result)
            
            total_time = (time.time() - start_time) * 1000
            
            return BatchDetectionResponse(
                success=True,
                results=results,
                total_processing_time_ms=total_time
            )
            
        except Exception as e:
            logger.error(f"Batch prediction failed: {e}")
            total_time = (time.time() - start_time) * 1000
            
            return BatchDetectionResponse(
                success=False,
                results=[],
                total_processing_time_ms=total_time
            )
    
    def get_health_status(self) -> ModelHealthResponse:
        """Get server health status"""
        try:
            # Memory usage
            if torch.cuda.is_available():
                memory_usage = torch.cuda.memory_allocated() / 1024 / 1024  # MB
            else:
                import psutil
                memory_usage = psutil.Process().memory_info().rss / 1024 / 1024  # MB
            
            uptime = time.time() - self.start_time
            
            return ModelHealthResponse(
                status="healthy" if self.model is not None else "unhealthy",
                model_loaded=self.model is not None,
                gpu_available=torch.cuda.is_available(),
                memory_usage_mb=memory_usage,
                uptime_seconds=uptime
            )
            
        except Exception as e:
            logger.error(f"Health check failed: {e}")
            return ModelHealthResponse(
                status="unhealthy",
                model_loaded=False,
                gpu_available=False,
                memory_usage_mb=0.0,
                uptime_seconds=0.0
            )
    
    def get_stats(self) -> Dict[str, Any]:
        """Get server statistics"""
        uptime = time.time() - self.start_time
        avg_processing_time = (
            self.total_processing_time / self.request_count 
            if self.request_count > 0 else 0.0
        )
        
        return {
            "uptime_seconds": uptime,
            "total_requests": self.request_count,
            "average_processing_time_ms": avg_processing_time,
            "requests_per_second": self.request_count / uptime if uptime > 0 else 0.0,
            "model_device": str(self.device),
            "gpu_available": torch.cuda.is_available()
        }

# =============================================================================
# FASTAPI APPLICATION
# =============================================================================

# Global model server instance
model_server: Optional[ModelServer] = None

# Create FastAPI app
app = FastAPI(
    title="Browser AI Agent - Element Detection API",
    description="Production API for AI-powered web element detection",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    """Initialize model server on startup"""
    global model_server
    
    try:
        model_path = "./models/best_model.pt"
        config_path = "./models/config.json"
        
        model_server = ModelServer(
            model_path=model_path,
            config_path=config_path,
            device="auto"
        )
        
        logger.info("Model server initialized successfully")
        
    except Exception as e:
        logger.error(f"Failed to initialize model server: {e}")
        raise

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    logger.info("Shutting down model server")

# =============================================================================
# API ENDPOINTS
# =============================================================================

@app.get("/", response_model=Dict[str, str])
async def root():
    """Root endpoint"""
    return {
        "message": "Browser AI Agent - Element Detection API",
        "version": "1.0.0",
        "status": "running"
    }

@app.get("/health", response_model=ModelHealthResponse)
async def health_check():
    """Health check endpoint"""
    if model_server is None:
        raise HTTPException(status_code=503, detail="Model server not initialized")
    
    return model_server.get_health_status()

@app.get("/stats", response_model=Dict[str, Any])
async def get_stats():
    """Get server statistics"""
    if model_server is None:
        raise HTTPException(status_code=503, detail="Model server not initialized")
    
    return model_server.get_stats()

@app.post("/predict", response_model=ElementDetectionResponse)
async def predict_element(request: ElementDetectionRequest):
    """Predict element location in screenshot"""
    if model_server is None:
        raise HTTPException(status_code=503, detail="Model server not initialized")
    
    return await model_server.predict_element(request)

@app.post("/predict/batch", response_model=BatchDetectionResponse)
async def predict_batch(request: BatchDetectionRequest):
    """Batch element prediction"""
    if model_server is None:
        raise HTTPException(status_code=503, detail="Model server not initialized")
    
    return await model_server.predict_batch(request)

@app.post("/predict/upload", response_model=ElementDetectionResponse)
async def predict_from_upload(
    file: UploadFile = File(...),
    description: str = "Find element",
    dom_html: str = "",
    confidence_threshold: float = 0.5
):
    """Predict element from uploaded image file"""
    if model_server is None:
        raise HTTPException(status_code=503, detail="Model server not initialized")
    
    try:
        # Read and encode image
        image_data = await file.read()
        image_base64 = base64.b64encode(image_data).decode('utf-8')
        
        # Create request
        request = ElementDetectionRequest(
            screenshot_base64=image_base64,
            description=description,
            dom_html=dom_html,
            confidence_threshold=confidence_threshold
        )
        
        return await model_server.predict_element(request)
        
    except Exception as e:
        logger.error(f"Upload prediction failed: {e}")
        raise HTTPException(status_code=400, detail=str(e))

# =============================================================================
# WEBSOCKET SUPPORT FOR REAL-TIME PREDICTIONS
# =============================================================================

from fastapi import WebSocket, WebSocketDisconnect
import json

class ConnectionManager:
    """WebSocket connection manager"""
    
    def __init__(self):
        self.active_connections: List[WebSocket] = []
    
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"WebSocket connected. Total connections: {len(self.active_connections)}")
    
    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)
        logger.info(f"WebSocket disconnected. Total connections: {len(self.active_connections)}")
    
    async def send_personal_message(self, message: str, websocket: WebSocket):
        await websocket.send_text(message)
    
    async def broadcast(self, message: str):
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except:
                # Remove dead connections
                self.active_connections.remove(connection)

manager = ConnectionManager()

@app.websocket("/ws/predict")
async def websocket_predict(websocket: WebSocket):
    """WebSocket endpoint for real-time predictions"""
    await manager.connect(websocket)
    
    try:
        while True:
            # Receive data
            data = await websocket.receive_text()
            
            try:
                # Parse request
                request_data = json.loads(data)
                request = ElementDetectionRequest(**request_data)
                
                # Make prediction
                if model_server:
                    response = await model_server.predict_element(request)
                    
                    # Send response
                    await manager.send_personal_message(
                        response.json(), 
                        websocket
                    )
                else:
                    error_response = {
                        "success": False,
                        "error": "Model server not initialized"
                    }
                    await manager.send_personal_message(
                        json.dumps(error_response), 
                        websocket
                    )
                    
            except Exception as e:
                error_response = {
                    "success": False,
                    "error": str(e)
                }
                await manager.send_personal_message(
                    json.dumps(error_response), 
                    websocket
                )
                
    except WebSocketDisconnect:
        manager.disconnect(websocket)

# =============================================================================
# MAIN FUNCTION
# =============================================================================

def main():
    """Run the model server"""
    
    # Configuration
    host = "0.0.0.0"
    port = 8000
    workers = 1  # Single worker for model consistency
    
    logger.info(f"Starting model server on {host}:{port}")
    
    # Run server
    uvicorn.run(
        "model_server:app",
        host=host,
        port=port,
        workers=workers,
        reload=False,
        access_log=True,
        log_level="info"
    )

if __name__ == "__main__":
    main()