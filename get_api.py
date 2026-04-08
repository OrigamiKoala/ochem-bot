import os

def get_config():
    return jsonify({
        "api_key": os.getenv('GEMINI_API_KEY'),
    })
