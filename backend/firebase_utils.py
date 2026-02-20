
import firebase_admin
from firebase_admin import credentials, firestore, storage
import os

# Global variables to hold clients
db = None
bucket = None

def initialize_firebase():
    global db, bucket
    
    # Check if we're already initialized
    if firebase_admin._apps:
        return

    # Check for service account file
    cred_path = "serviceAccountKey.json"
    if not os.path.exists(cred_path):
        print(f"Warning: {cred_path} not found. Firebase features will be disabled.")
        return

    try:
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred, {
            'storageBucket': 'healthcare-39269.firebasestorage.app'
        })
        db = firestore.client()
        bucket = storage.bucket()
        print("Firebase Admin Initialized Successfully")
    except Exception as e:
        print(f"Error initializing Firebase: {e}")

def get_db():
    return db

def get_bucket():
    return bucket
