from django.urls import path
from . import views

urlpatterns = [
    path('', views.index, name='webapp_index'),
    path('under_construction', views.under_construction, name='webapp_under_construction'),
    path('contact', views.contact, name='webapp_contact'),
    path('about', views.about, name='webapp_about'),
    path('business', views.business, name='webapp_business'),
    # add more patterns here…
]
