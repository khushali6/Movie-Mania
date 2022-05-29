# Movie-Mania
Movie Mania is a Web Application which recommends the movies user might like to watch based upon the interactions of user with the system. It uses content based filtering, collaborative  filtering and demographic model to display recommend user with the movies.<br/>
1. Knowledge-based<br/>
2. Content-based<br/>
3. Collaborative Based<br/>
Recommender system is built using Pandas operations and by fitting KNN, SVD & deep learning models which use NLP techniques and NN architecture to suggest movies for the users based on similar users and for queries specific to genre, user, movie, rating, popularity.<br/>

## Installation<br/>
Python and Django need to be installed and other libraries<br/>

```bash pip install django```<br/>
```bash pip install pandas```<br/>
```bash pip install seaborn```<br/>
```bash pip install numpy```<br/>
```bash pip install sklearn```<br/>

## Setup Virtual Environment
```bash virtualenv App```<br/>
```bash cd App```<br/>
```bash source bin/activate```<br/>

## Usage<br/>
Go to the App folder and run<br/>
```bash python manage.py runserver```<br/>
Then go to the browser and enter the url **http://127.0.0.1:8000/**<br/>

## Database Configuration<br/>
```bash python manage.py makemigrations```<br/>
```bash python manage.py migrate```<br/>

## Create Superuser<br/>
```bashpython manage.py createsuperuser```
