from marshal import load
from django.shortcuts import render, redirect, HttpResponse
from .models import Register,Login
from django.contrib import messages
import pandas as pd
import csv



# Create your views here.
def index(request):
    if request.session.has_key('uid'):
        id=request.session['uid']
        df = pd.read_csv("Home/Model/movies.csv")
        df1 = pd.read_csv("Home/Model/ratings.csv")
        # Action
        act_movies=df[(df['genres']=='Action')]
        act_movies=act_movies['title']
        act_movies=act_movies.head(6)
        # Romantic
        rom_movies=df[(df['genres']=='Romance')]
        rom_movies=rom_movies['title']
        rom_movies=rom_movies.head(6)

        
        return render(request, 'index.html',{'id':id,'action':act_movies,'romance':rom_movies})


def login(request):
    if request.method == 'POST':
        email = request.POST['email']
        password = request.POST['pass']
        logindata = Login.objects.filter(lemail=email)
       
        for i in logindata:
            if email == i.lemail and password == i.lpwd:  
                LogID=i.id
                request.session['uid']=LogID
                return redirect(index)
            else:
                messages.error(request,"Invalid Credentials, Please try again")
                return render(request, 'login.html')
    return render(request, 'login.html')


def register(request):
    if request.method == "POST":
        name = request.POST.get('name')
        age = request.POST.get('age')
        email = request.POST.get('email')
        password = request.POST.get('pass')
        logindata = Login.objects.filter(lemail=email)
        for i in logindata:
            if email == i.lemail:
                return render(request, 'login.html')

        register = Register(rname=name, remail=email, rage=age, rpassword=password)
        print("Trying to save in register")
        register.save()
        print("saved in register")
        login = Login(lname=name, lemail=email, lpwd=password)
        login.save()
        messages.success(request, "Saved in Login")
    return render(request, 'register.html')


def about(request):
    return render(request, 'about.html')


def contact(request):
    return render(request, 'contact.html')

def movie_table(request):
    return render(request, 'movie_table')






