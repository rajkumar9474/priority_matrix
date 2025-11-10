from django.shortcuts import render, redirect
from django.contrib.auth import login, logout, authenticate
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User
from django.contrib import messages
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from .models import Task, UserSettings
from .serializers import TaskSerializer, UserSettingsSerializer, UserRegistrationSerializer
import json


# Main app view
@login_required
def index(request):
    """Main app page - requires authentication"""
    return render(request, 'tasks/index.html', {
        'user': request.user
    })


# Authentication views
def login_view(request):
    """Handle user login"""
    if request.user.is_authenticated:
        return redirect('tasks:index')
    
    if request.method == 'POST':
        username = request.POST.get('username')
        password = request.POST.get('password')
        
        # Check if username exists
        try:
            user_exists = User.objects.filter(username=username).exists()
            
            if not user_exists:
                messages.error(request, '❌ Username does not exist. Please check your username or sign up for a new account.')
            else:
                # Try to authenticate
                user = authenticate(request, username=username, password=password)
                
                if user is not None:
                    login(request, user)
                    messages.success(request, f'🎉 Welcome back, {user.username}!')
                    return redirect('tasks:index')
                else:
                    messages.error(request, '❌ Incorrect password. Please try again.')
        except Exception as e:
            messages.error(request, f'⚠️ An error occurred: {str(e)}')
    
    return render(request, 'tasks/login.html')


def register_view(request):
    """Handle user registration"""
    if request.user.is_authenticated:
        return redirect('tasks:index')
    
    if request.method == 'POST':
        serializer = UserRegistrationSerializer(data=request.POST)
        if serializer.is_valid():
            user = serializer.save()
            # Create default settings for new user
            UserSettings.objects.create(user=user)
            login(request, user)
            messages.success(request, 'Registration successful!')
            return redirect('tasks:index')
        else:
            for field, errors in serializer.errors.items():
                for error in errors:
                    messages.error(request, f"{field}: {error}")
    
    return render(request, 'tasks/register.html')


def logout_view(request):
    """Handle user logout"""
    logout(request)
    messages.success(request, 'Logged out successfully')
    return redirect('tasks:login')


# REST API Views for tasks
class TaskListCreateView(generics.ListCreateAPIView):
    """
    GET: List all tasks for the authenticated user
    POST: Create a new task
    """
    serializer_class = TaskSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        return Task.objects.filter(user=self.request.user).order_by('id')
    
    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class TaskDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET: Retrieve a specific task
    PUT/PATCH: Update a task
    DELETE: Delete a task
    """
    serializer_class = TaskSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        return Task.objects.filter(user=self.request.user)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def bulk_update_tasks(request):
    """
    Bulk update tasks (useful for reordering, moving between quadrants)
    Expects: { "tasks": [{"id": 1, "placed_in": "q1", "order_in_zone": 0}, ...] }
    """
    tasks_data = request.data.get('tasks', [])
    
    if not tasks_data:
        return Response({'error': 'No tasks provided'}, status=status.HTTP_400_BAD_REQUEST)
    
    updated_tasks = []
    for task_data in tasks_data:
        task_id = task_data.get('id')
        try:
            task = Task.objects.get(id=task_id, user=request.user)
            for field, value in task_data.items():
                if field != 'id' and hasattr(task, field):
                    setattr(task, field, value)
            task.save()
            updated_tasks.append(task)
        except Task.DoesNotExist:
            continue
    
    serializer = TaskSerializer(updated_tasks, many=True)
    return Response({'tasks': serializer.data}, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def reset_tasks(request):
    """
    Delete all tasks for the authenticated user
    """
    try:
        deleted_count, _ = Task.objects.filter(user=request.user).delete()
        return Response({
            'success': True,
            'message': f'Successfully deleted {deleted_count} task(s)',
            'deleted_count': deleted_count
        }, status=status.HTTP_200_OK)
    except Exception as e:
        return Response({
            'error': f'Error deleting tasks: {str(e)}'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class UserSettingsView(generics.RetrieveUpdateAPIView):
    """
    GET: Get user settings
    PUT/PATCH: Update user settings
    """
    serializer_class = UserSettingsSerializer
    permission_classes = [IsAuthenticated]
    
    def get_object(self):
        settings, created = UserSettings.objects.get_or_create(user=self.request.user)
        return settings
