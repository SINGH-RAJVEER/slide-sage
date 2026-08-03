import os

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    new_content = content
    # Replace "/api/" with "/" in strings / paths
    # We want to be careful: replace "/api/auth", "/api/profile", "/api/ai", "/api/billing", "/api/presentations", "/api/health", "/api/research-presentation", "/api/generate-presentation-stream", "/api/iterate-presentation-stream"
    
    replacements = [
        ('/api/auth', '/auth'),
        ('/api/profile', '/profile'),
        ('/api/ai', '/ai'),
        ('/api/billing', '/billing'),
        ('/api/presentations', '/presentations'),
        ('/api/health', '/health'),
        ('/api/research-presentation', '/research-presentation'),
        ('/api/generate-presentation-stream', '/generate-presentation-stream'),
        ('/api/iterate-presentation-stream', '/iterate-presentation-stream'),
    ]
    
    for old, new in replacements:
        new_content = new_content.replace(old, new)
        
    if new_content != content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Updated: {filepath}")

for root, dirs, files in os.walk('apps'):
    for file in files:
        if file.endswith(('.go', '.ts', '.tsx', '.js')):
            process_file(os.path.join(root, file))

for root, dirs, files in os.walk('libs'):
    for file in files:
        if file.endswith(('.go', '.ts', '.tsx', '.js')):
            process_file(os.path.join(root, file))
