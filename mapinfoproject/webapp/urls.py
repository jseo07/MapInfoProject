from django.urls import path
from . import views
from django.http import HttpResponse
from django.core.files.storage import default_storage

def storage_debug(_):
    cls = default_storage.__class__
    return HttpResponse(f"{cls.__module__}.{cls.__name__}")


urlpatterns = [
    path('', views.index, name='webapp_index'),
    path('under_construction', views.under_construction, name='webapp_under_construction'),
    path('contact', views.contact, name='webapp_contact'),
    path('about', views.about, name='webapp_about'),
    path('business', views.business, name='webapp_business'),
    path('contact_page', views.contact_page, name='webapp_contact_page'),
    path("debug/storage/", storage_debug),
    # add more patterns here…
]
