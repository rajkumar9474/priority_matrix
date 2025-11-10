from django.urls import path
from django.contrib.auth import views as auth_views
from . import views

app_name = 'tasks'

urlpatterns = [
    # Main app view
    path('', views.index, name='index'),
    
    # Authentication URLs
    path('login/', views.login_view, name='login'),
    path('register/', views.register_view, name='register'),
    path('logout/', views.logout_view, name='logout'),
    
    # API endpoints for tasks
    path('api/tasks/', views.TaskListCreateView.as_view(), name='task-list'),
    path('api/tasks/<int:pk>/', views.TaskDetailView.as_view(), name='task-detail'),
    path('api/tasks/bulk-update/', views.bulk_update_tasks, name='task-bulk-update'),
    path('api/tasks/reset/', views.reset_tasks, name='task-reset'),
    
    # Settings endpoint
    path('api/settings/', views.UserSettingsView.as_view(), name='user-settings'),
]
