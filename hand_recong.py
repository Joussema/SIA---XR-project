import cv2
import mediapipe as mp
import time
import numpy as np

# Initialize MediaPipe Hands
mp_hands = mp.solutions.hands
mp_drawing = mp.solutions.drawing_utils
hands = mp_hands.Hands(max_num_hands=2, min_detection_confidence=0.7)

# Variables for timing
right_hand_up_start = None
left_hand_up_start = None
DELAY_TIME = 10  # seconds to confirm a gesture

# Open webcam
cap = cv2.VideoCapture(0)

print("🖐 Hand gesture recognition started...")
print("Raise your right hand to move forward or left hand to move backward.")
print("Press 'q' to quit.\n")

while True:
    ret, frame = cap.read()
    if not ret:
        break

    # Flip for natural viewing
    frame = cv2.flip(frame, 1)

    # Convert to RGB
    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    result = hands.process(rgb_frame)

    # Create black background (for visualization)
    black = np.zeros_like(frame)

    right_avg_y = None
    left_avg_y = None

    # Draw hands if detected
    if result.multi_hand_landmarks:
        for hand_landmarks, hand_label in zip(result.multi_hand_landmarks, result.multi_handedness):
            label = hand_label.classification[0].label  # "Right" or "Left"

            # Draw the skeleton
            mp_drawing.draw_landmarks(
                black, hand_landmarks, mp_hands.HAND_CONNECTIONS,
                mp_drawing.DrawingSpec(color=(0, 255, 255), thickness=2, circle_radius=3),
                mp_drawing.DrawingSpec(color=(255, 0, 0), thickness=2)
            )

            avg_y = np.mean([lm.y for lm in hand_landmarks.landmark])
            if label == "Right":
                right_avg_y = avg_y
            else:
                left_avg_y = avg_y

    current_time = time.time()
    right_elapsed = 0
    left_elapsed = 0

    # --- Right Hand Logic ---
    if right_avg_y is not None:
        if right_avg_y < 0.5:  # hand raised
            if right_hand_up_start is None:
                right_hand_up_start = current_time
            right_elapsed = current_time - right_hand_up_start

            if right_elapsed > DELAY_TIME:
                print("➡ Moving Forward (Output = 1)")
                right_hand_up_start = None
        else:
            right_hand_up_start = None

    # --- Left Hand Logic ---
    if left_avg_y is not None:
        if left_avg_y < 0.5:
            if left_hand_up_start is None:
                left_hand_up_start = current_time
            left_elapsed = current_time - left_hand_up_start

            if left_elapsed > DELAY_TIME:
                print("⬅ Moving Backward (Output = 0)")
                left_hand_up_start = None
        else:
            left_hand_up_start = None

    # 🟩 Display timers on the image
    cv2.putText(black, f"Right hand: {right_elapsed:.2f}s", (10, 40),
                cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
    cv2.putText(black, f"Left hand:  {left_elapsed:.2f}s", (10, 90),
                cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 0, 0), 2)

    # Footer text
    cv2.putText(black, "Press 'q' to quit", (10, black.shape[0] - 20),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (200, 200, 200), 1)

    cv2.imshow("3D Hand View", black)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
print("\n👋 Program closed.")
