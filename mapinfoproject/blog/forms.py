from django import forms
from .models import Post

class PostForm(forms.ModelForm):
    class Meta:
        model = Post
        fields = ['title', 'content', 'cover_image', 'published']
        widgets = {
            'title': forms.TextInput(attrs={'class': 'form-input', 'placeholder': '제목'}),
            'content': forms.Textarea(attrs={'class': 'form-textarea', 'rows': 12, 'placeholder': '내용을 입력하세요'}),
            'published': forms.CheckboxInput(attrs={'class': 'form-checkbox'}),
        }
