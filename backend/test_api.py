import json
import uuid
from datetime import datetime
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_endpoints():
    # 1. Login
    login_response = client.post(
        "/api/v1/auth/login",
        json={"email_or_phone": "test_worker@locaralabs.com", "password": "securepassword"}
    )
    print("Login Response Status:", login_response.status_code)
    token_data = login_response.json()
    print("Token Data:", token_data)
    
    headers = {"Authorization": f"Bearer {token_data['access_token']}"}

    # 2. Register Video Metadata
    video_id = str(uuid.uuid4())
    metadata_payload = {
        "video_id": video_id,
        "started_at": datetime.now().isoformat(),
        "ended_at": datetime.now().isoformat(),
        "duration_ms": 15000,
        "file_size_bytes": 124500,
        "fps": 30.0,
        "fps_tier": "standard",
        "resolution": "1920x1080",
        "local_path": "/storage/emulated/0/DCIM/Camera/vid1.mp4",
        "device_model": "Pixel 6",
        "os_version": "Android 13",
        "extensible_metadata": {"gps_accuracy": 5.2, "battery_status": "charging"}
    }
    
    metadata_response = client.post(
        "/api/v1/videos/metadata",
        headers=headers,
        json=metadata_payload
    )
    print("Metadata Register Status:", metadata_response.status_code)
    if metadata_response.status_code != 201:
        print("Error details:", metadata_response.text)
    else:
        print("Metadata Response:", metadata_response.json())

    # 3. List Videos
    list_response = client.get("/api/v1/videos", headers=headers)
    print("List Videos Status:", list_response.status_code)
    if list_response.status_code == 200:
        print("List Videos Count:", len(list_response.json()))
        print("List Videos Content:", list_response.json())

if __name__ == "__main__":
    test_endpoints()
