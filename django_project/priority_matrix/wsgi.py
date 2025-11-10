"""
WSGI config for priority_matrix project.
"""

import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'priority_matrix.settings')

application = get_wsgi_application()
