from django.urls import path
from .views import (
    PostListView, PostDetailView,
    PostCreateView, PostUpdateView, PostDeleteView
)

app_name = 'blog'

urlpatterns = [
    path('', PostListView.as_view(), name='list'),
    path('new/', PostCreateView.as_view(), name='create'),                 # staff
    path('<slug:slug>/', PostDetailView.as_view(), name='detail'),
    path('<slug:slug>/edit/', PostUpdateView.as_view(), name='edit'),      # staff
    path('<slug:slug>/delete/', PostDeleteView.as_view(), name='delete'),  # staff
]