from django.db import models
from django.contrib.auth.models import User


class Task(models.Model):
    """
    Task model to store user tasks with Eisenhower Matrix placement.
    Each task belongs to a specific user.
    """
    QUADRANT_CHOICES = [
        (None, 'Not Assigned'),
        ('q1', 'Urgent & Important'),
        ('q2', 'Important • Not Urgent'),
        ('q3', 'Urgent • Not Important'),
        ('q4', 'Not Urgent • Not Important'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='tasks')
    title = models.CharField(max_length=500)
    color_index = models.IntegerField(default=0)
    placed_in = models.CharField(max_length=2, choices=QUADRANT_CHOICES, null=True, blank=True)
    completed = models.BooleanField(default=False)
    order_in_zone = models.IntegerField(default=0)  # Order within the quadrant
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['id']

    def __str__(self):
        return f"{self.user.username} - Task #{self.id}: {self.title}"


class UserSettings(models.Model):
    """
    Store user-specific settings (theme, preferences, etc.)
    """
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='settings')
    settings_json = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.username}'s Settings"
