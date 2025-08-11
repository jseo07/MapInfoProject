from django.urls import path
from . import views
from django.contrib.admin.views.decorators import staff_member_required

app_name='mapapp'

urlpatterns = [
    path('', staff_member_required(views.index), name='map_index'),
    path('api/landuse_wfs/', views.landuse_wfs, name='landuse_wfs'),
    path('api/pnu_info/',    views.pnu_info,      name='pnu_info'),

]