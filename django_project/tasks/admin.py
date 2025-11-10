from django.contrib import admin
from .models import Task

@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    list_display = ['id', 'title', 'user', 'placed_in', 'completed', 'created_at']
    list_filter = ['completed', 'placed_in', 'user']
    search_fields = ['title', 'user__username']
    ordering = ['-created_at']
