# Movie-Mania
Movie Mania is a Web Application which recommends the movies user might like to watch based upon the interactions of user with the system. It uses content based filtering, collaborative  filtering and demographic model to display recommend user with the movies.<br/>
1. Knowledge-based<br/>
2. Content-based<br/>
3. Collaborative Based<br/>
Recommender system is built using Pandas operations and by fitting KNN, SVD & deep learning models which use NLP techniques and NN architecture to suggest movies for the users based on similar users and for queries specific to genre, user, movie, rating, popularity.<br/>

## Installation<br/>
Python and Django need to be installed and other libraries<br/>

``` pip install django```<br/>
``` pip install pandas```<br/>
``` pip install seaborn```<br/>
``` pip install numpy```<br/>
``` pip install sklearn```<br/>

## Setup Virtual Environment
``` virtualenv App```<br/>
``` cd App```<br/>
``` source bin/activate```<br/>

## Usage<br/>
Go to the App folder and run<br/>
``` python manage.py runserver```<br/>
Then go to the browser and enter the url **http://127.0.0.1:8000/**<br/>

## Database Configuration<br/>
``` python manage.py makemigrations```<br/>
``` python manage.py migrate```<br/>

## Create Superuser<br/>
```python manage.py createsuperuser```
