from django.urls import path
from . import views

urlpatterns = [
    path('', views.index, name='map_index'),
    path('api/landuse_wfs/', views.landuse_wfs, name='landuse_wfs'),
    path('api/pnu_info/',    views.pnu_info,      name='pnu_info'),

]