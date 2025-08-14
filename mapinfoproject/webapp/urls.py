from django.urls import path
from . import views
from django.http import HttpResponse, JsonResponse
from django.core.files.storage import default_storage

def storage_env_debug(_):
    return JsonResponse({
        "DEFAULT_FILE_STORAGE": str(settings.DEFAULT_FILE_STORAGE),
        "cloudinary_in_apps": ("cloudinary" in settings.INSTALLED_APPS),
        "cloudinary_storage_in_apps": ("cloudinary_storage" in settings.INSTALLED_APPS),
        "DJANGO_SETTINGS_MODULE": os.environ.get("DJANGO_SETTINGS_MODULE"),
        "has_CLOUDINARY_URL_env": bool(os.environ.get("CLOUDINARY_URL")),
    })


urlpatterns = [
    path('', views.index, name='webapp_index'),
    path('under_construction', views.under_construction, name='webapp_under_construction'),
    path('contact', views.contact, name='webapp_contact'),
    path('about', views.about, name='webapp_about'),
    path('business', views.business, name='webapp_business'),
    path('contact_page', views.contact_page, name='webapp_contact_page'),
    path("debug/storage/", storage_env_debug),
    # add more patterns here…
]
