from django.shortcuts import render

# Create your views here.
def index(request):
    return render(request, 'webapp/index.html')

def under_construction(request):
    return render(request, 'webapp/under_construction.html')

def contact(request):
    return render(request, 'webapp/contact.html')