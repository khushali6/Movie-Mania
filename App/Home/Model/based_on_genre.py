#!/usr/bin/env python
# coding: utf-8

# In[3]:


from math import sqrt
import pandas as pd
import numpy as np
import sys
import seaborn as sns
from matplotlib import pyplot as plt
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import linear_kernel
from sklearn.metrics import pairwise_distances
from scipy.sparse import csr_matrix
from sklearn.neighbors import NearestNeighbors
from scipy.spatial.distance import cosine, correlation


# In[4]:


ratings = pd.read_csv('ratings.csv')
movies = pd.read_csv('movies.csv')


# In[5]:


df_movies = movies 
df_ratings = ratings






merge_movies_rating=pd.merge(df_movies,df_ratings,on='movieId')



merge_movies_rating=merge_movies_rating.drop('timestamp',axis=1)



# In[11]:


# ratings_grouped_by_users = merge_movies_rating.groupby('userId').agg([np.size, np.mean])
# ratings_grouped_by_users = ratings_grouped_by_users.drop('movieId', axis = 1)



# In[ ]:


# ratings_grouped_by_movies = merge_movies_rating.groupby('movieId').agg([np.mean], np.size)
# ratings_grouped_by_movies = ratings_grouped_by_movies.drop('userId', axis=1)
# ratings_grouped_by_movies['rating']['mean'].sort_values(ascending=False).head(20).plot(kind='barh', figsize=(7,6));


# In[ ]:





# In[ ]:


tfidf_movies_genres = TfidfVectorizer(token_pattern = '[a-zA-Z0-9\-]+')
df_movies['genres'] = df_movies['genres'].replace(to_replace="(no genres listed)", value="")
tfidf_movies_genres_matrix = tfidf_movies_genres.fit_transform(df_movies['genres'])
cosine_sim_movies = linear_kernel(tfidf_movies_genres_matrix, tfidf_movies_genres_matrix)



# In[ ]:


def get_recommendations_based_on_genres(movie_title, cosine_sim_movies=cosine_sim_movies):
    """
    Calculates top 2 movies to recommend based on given movie titles genres. 
    :param movie_title: title of movie to be taken for base of recommendation
    :param cosine_sim_movies: cosine similarity between movies 
    :return: Titles of movies recommended to user
    """
    # Get the index of the movie that matches the title
    idx_movie = df_movies.loc[df_movies['title'].isin([movie_title])]
    idx_movie = idx_movie.index
    
    # Get the pairwsie similarity scores of all movies with that movie
    sim_scores_movies = list(enumerate(cosine_sim_movies[idx_movie][0]))
    
    # Sort the movies based on the similarity scores
    sim_scores_movies = sorted(sim_scores_movies, key=lambda x: x[1], reverse=True)

    # Get the scores of the 10 most similar movies
    sim_scores_movies = sim_scores_movies[1:11]
    
    # Get the movie indices
    movie_indices = [i[0] for i in sim_scores_movies]
    
    # Return the top 2 most similar movies
    return df_movies['title'].iloc[movie_indices]


# In[ ]:


print(get_recommendations_based_on_genres("Iron Man (2008)"))


# In[ ]:


