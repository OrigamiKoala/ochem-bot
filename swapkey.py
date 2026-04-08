import os

def main():
    # Retrieve the environment variable mapped in the YAML
    api_key = os.getenv('API_KEY')

    if api_key is None:
        print("Error: API_KEY environment variable is not set.")
        return

    # Use the key in your logic (e.g., in a header for a request)
    print(f"Successfully retrieved key of length: {len(api_key)}")
    
    # Example usage with a hypothetical API
    # response = requests.get("https://api.example.com/data", headers={"Authorization": api_key})

if __name__ == "__main__":
    main()
