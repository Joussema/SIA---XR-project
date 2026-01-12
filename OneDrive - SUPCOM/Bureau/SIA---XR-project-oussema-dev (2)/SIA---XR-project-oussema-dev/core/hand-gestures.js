// hand-gestures.js
export class HandDetection {
    constructor() {
        this.video = null;
        this.canvas = null;
        this.ctx = null;
        this.hands = null;
        this.isHandOpen = false;
        this.isDetecting = false;
        this.onHandStateChange = null;
        
        this.LANDMARK_INDICES = {
            WRIST: 0,
            THUMB_CMC: 1,
            THUMB_MCP: 2,
            THUMB_IP: 3,
            THUMB_TIP: 4,
            INDEX_FINGER_MCP: 5,
            INDEX_FINGER_PIP: 6,
            INDEX_FINGER_DIP: 7,
            INDEX_FINGER_TIP: 8,
            MIDDLE_FINGER_MCP: 9,
            MIDDLE_FINGER_PIP: 10,
            MIDDLE_FINGER_DIP: 11,
            MIDDLE_FINGER_TIP: 12,
            RING_FINGER_MCP: 13,
            RING_FINGER_PIP: 14,
            RING_FINGER_DIP: 15,
            RING_FINGER_TIP: 16,
            PINKY_MCP: 17,
            PINKY_PIP: 18,
            PINKY_DIP: 19,
            PINKY_TIP: 20
        };
    }

    async initialize() {
        try {
            // Check if MediaPipe Hands is available
            if (typeof Hands === 'undefined') {
                throw new Error('MediaPipe Hands not loaded. Make sure hands.js script is included in HTML.');
            }

            this.video = document.createElement('video');
            this.canvas = document.createElement('canvas');
            this.ctx = this.canvas.getContext('2d');
            
            this.video.style.display = 'none';
            this.canvas.style.display = 'none';
            document.body.appendChild(this.video);
            document.body.appendChild(this.canvas);

            this.hands = new Hands({
                locateFile: (file) => {
                    return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
                }
            });

            this.hands.setOptions({
                maxNumHands: 1,
                modelComplexity: 1,
                minDetectionConfidence: 0.5,
                minTrackingConfidence: 0.5
            });

            this.hands.onResults(this.onResults.bind(this));
            await this.startBackCamera();
            
            return true;
        } catch (error) {
            console.error('Failed to initialize hand detection:', error);
            return false;
        }
    }

    async startBackCamera() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: { exact: 'environment' }
                }
            });

            this.video.srcObject = stream;

            return new Promise((resolve) => {
                this.video.onloadedmetadata = () => {
                    this.video.play();
                    this.canvas.width = this.video.videoWidth;
                    this.canvas.height = this.video.videoHeight;
                    this.startDetection();
                    resolve();
                };
            });

        } catch (error) {
            console.error('Back camera error, trying front camera:', error);
            
            // Fallback to front camera
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: true
                });
                this.video.srcObject = stream;
                
                return new Promise((resolve) => {
                    this.video.onloadedmetadata = () => {
                        this.video.play();
                        this.canvas.width = this.video.videoWidth;
                        this.canvas.height = this.video.videoHeight;
                        this.startDetection();
                        resolve();
                    };
                });
            } catch (fallbackError) {
                console.error('All camera access failed:', fallbackError);
                throw new Error('Cannot open any camera');
            }
        }
    }

    startDetection() {
        this.isDetecting = true;
        
        const frameLoop = async () => {
            if (!this.isDetecting) return;
            
            try {
                await this.hands.send({ image: this.video });
                requestAnimationFrame(frameLoop);
            } catch (error) {
                console.error('Detection error:', error);
                this.isDetecting = false;
            }
        };
        
        frameLoop();
    }

    onResults(results) {
        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            const landmarks = results.multiHandLandmarks[0];
            const wasHandOpen = this.isHandOpen;
            this.isHandOpen = this.detectHandOpen(landmarks);
            
            if (wasHandOpen !== this.isHandOpen && this.onHandStateChange) {
                this.onHandStateChange(this.isHandOpen);
            }
        } else {
            if (this.isHandOpen !== false) {
                this.isHandOpen = false;
                if (this.onHandStateChange) {
                    this.onHandStateChange(false);
                }
            }
        }
    }

    detectHandOpen(landmarks) {
        const thumbTip = landmarks[this.LANDMARK_INDICES.THUMB_TIP];
        const indexTip = landmarks[this.LANDMARK_INDICES.INDEX_FINGER_TIP];
        
        const thumbIndexDistance = Math.hypot(
            thumbTip.x - indexTip.x,
            thumbTip.y - indexTip.y
        );

        const fingerTips = [
            this.LANDMARK_INDICES.INDEX_FINGER_TIP,
            this.LANDMARK_INDICES.MIDDLE_FINGER_TIP,
            this.LANDMARK_INDICES.RING_FINGER_TIP,
            this.LANDMARK_INDICES.PINKY_TIP
        ];

        const fingerMcps = [
            this.LANDMARK_INDICES.INDEX_FINGER_MCP,
            this.LANDMARK_INDICES.MIDDLE_FINGER_MCP,
            this.LANDMARK_INDICES.RING_FINGER_MCP,
            this.LANDMARK_INDICES.PINKY_MCP
        ];

        let extendedFingers = 0;
        
        for (let i = 0; i < fingerTips.length; i++) {
            const tip = landmarks[fingerTips[i]];
            const mcp = landmarks[fingerMcps[i]];
            
            if (tip.y < mcp.y) {
                extendedFingers++;
            }
        }

        return thumbIndexDistance > 0.1 || extendedFingers >= 3;
    }

    getHandState() {
        return {
            isHandOpen: this.isHandOpen,
            isDetecting: this.isDetecting
        };
    }

    stopDetection() {
        this.isDetecting = false;
        
        if (this.video && this.video.srcObject) {
            const tracks = this.video.srcObject.getTracks();
            tracks.forEach(track => track.stop());
        }
        
        if (this.video.parentNode) {
            this.video.parentNode.removeChild(this.video);
        }
        if (this.canvas.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas);
        }
    }

    setHandStateCallback(callback) {
        this.onHandStateChange = callback;
    }
}

export const handDetector = new HandDetection();