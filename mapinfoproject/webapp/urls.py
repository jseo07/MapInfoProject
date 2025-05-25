from django.urls import path
from . import views

urlpatterns = [
    path('', views.index, name='webapp_index'),
    path('under_construction', views.under_construction, name='webapp_under_construction'),
    path('contact', views.contact, name='webapp_contact'),
    # add more patterns here…
]
