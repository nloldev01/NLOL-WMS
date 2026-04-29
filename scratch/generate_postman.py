import os
import sys
import json
import django
from django.urls import get_resolver, URLPattern, URLResolver

# Set up Django environment
sys.path.append(r"c:\NLOL WMS")
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "nlol_wms.settings")
django.setup()

def get_urls(resolver=None, pre=''):
    if resolver is None:
        resolver = get_resolver()

    urls = []
    for pattern in resolver.url_patterns:
        if isinstance(pattern, URLPattern):
            # Try to get methods if it's a ViewSet/APIView
            methods = ['GET']
            if hasattr(pattern.callback, 'view_class'):
                if hasattr(pattern.callback.view_class, 'http_method_names'):
                    methods = [m.upper() for m in pattern.callback.view_class.http_method_names if m.upper() != 'OPTIONS']
            elif hasattr(pattern.callback, 'actions'):
                # For ViewSets registered with router
                methods = [m.upper() for m in getattr(pattern.callback, 'actions', {}).keys()]
            
            # Use pattern.pattern._route to get string route in Django 3+
            route = str(pattern.pattern)
            
            # Sometimes methods is empty or standard for DRF
            if not methods:
                methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
                
            urls.append({
                'path': pre + route,
                'name': pattern.name,
                'methods': methods
            })
        elif isinstance(pattern, URLResolver):
            route = str(pattern.pattern)
            urls.extend(get_urls(pattern, pre + route))
    return urls

def create_postman_collection(urls):
    collection = {
        "info": {
            "name": "NLOL WMS API Collection",
            "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
        },
        "item": []
    }
    
    # Group by base path
    groups = {}
    for u in urls:
        path = u['path']
        if not path.startswith('api/'):
            continue
            
        parts = path.split('/')
        if len(parts) > 1:
            group_name = parts[1]
        else:
            group_name = 'root'
            
        if group_name not in groups:
            groups[group_name] = []
            
        # Clean up path for postman
        # Django paths look like: api/master-data/units/<pk>/
        # Postman wants: {{base_url}}/api/master-data/units/:id/
        import re
        pm_path = re.sub(r'<[^>]+>', ':id', path)
        
        for method in u['methods']:
            # Create request item
            req_item = {
                "name": f"{method} /{pm_path}",
                "request": {
                    "method": method,
                    "header": [
                        {
                            "key": "Content-Type",
                            "value": "application/json"
                        }
                    ],
                    "url": {
                        "raw": f"{{{{base_url}}}}/{pm_path}",
                        "host": ["{{base_url}}"],
                        "path": pm_path.strip('/').split('/')
                    }
                },
                "response": []
            }
            groups[group_name].append(req_item)
            
    for group_name, items in groups.items():
        collection["item"].append({
            "name": group_name.replace('-', ' ').title(),
            "item": items
        })
        
    return collection

if __name__ == "__main__":
    urls = get_urls()
    collection = create_postman_collection(urls)
    
    with open(r"c:\NLOL WMS\postman_collection.json", "w") as f:
        json.dump(collection, f, indent=4)
        
    print("Postman collection generated at c:\\NLOL WMS\\postman_collection.json")
