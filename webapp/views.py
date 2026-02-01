from django.shortcuts import render, redirect
from django.http import HttpResponse
from django.core.mail import send_mail
from django.conf import settings
from django.contrib import messages
from django.utils.http import url_has_allowed_host_and_scheme

# Create your views here.
def index(request):
    return render(request, 'webapp/index.html')

def under_construction(request):
    return render(request, 'webapp/under_construction.html')

def contact(request):
    return render(request, 'webapp/contact.html')


def about(request):
    return render(request, 'webapp/about.html')

def business(request):
    return render(request, 'webapp/business.html')


def contact_page(request):
    if request.method == 'POST':
        name    = request.POST.get('name')
        email   = request.POST.get('email')
        phone   = request.POST.get('phone')
        message = request.POST.get('message')

        subject = f'New contact form submission from {name}'
        body = (
            f"Name: {name}\n"
            f"Email: {email}\n"
            f"Phone: {phone}\n\n"
            f"Message:\n{message}"
        )

        send_mail(
            subject,
            body,
            settings.DEFAULT_FROM_EMAIL,
            [settings.CONTACT_RECIPIENT_EMAIL],
            fail_silently=False,
        )

        messages.success(request, "감사합니다, 문의가 제출되었습니다.")
        next_url = request.POST.get('next', '/')
        if not url_has_allowed_host_and_scheme(next_url, allowed_hosts={request.get_host()}):
            next_url = '/'
        return redirect(next_url)
    return render(request, "webapp/contact_main.html")