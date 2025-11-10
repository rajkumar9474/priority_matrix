"""
ASGI config for priority_matrix project.
"""

import os

from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'priority_matrix.settings')

application = get_asgi_application()
