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

ratings = pd.read_csv('ratings.csv')
movies = pd.read_csv('movies.csv')

df_movies = movies 
df_ratings = ratings

merge_movies_rating=pd.merge(df_movies,df_ratings,on='movieId')
merge_movies_rating=merge_movies_rating.drop('timestamp',axis=1)

refined_dataset = merge_movies_rating.groupby(by=['userId','title'], as_index=False).agg({"rating":"mean"})
rating_count_df = pd.DataFrame(refined_dataset.groupby(['rating']).size(), columns=['count'])
num_users = len(refined_dataset['userId'].value_counts())
num_items = len(refined_dataset['title'].value_counts())
total_count = num_items * num_users
zero_count = total_count-refined_dataset.shape[0]
rating_count_df = rating_count_df.append(
    pd.DataFrame({'count': zero_count}, index=[0.0]),
    verify_integrity=True,
).sort_index()
rating_count_df['log_count'] = np.log(rating_count_df['count'])
rating_count_df = rating_count_df.reset_index().rename(columns={'index': 'rating score'})
movies_count_df = pd.DataFrame(refined_dataset.groupby('title').size(), columns=['count'])
user_to_movie_df = refined_dataset.pivot(
    index='userId',
     columns='title',
      values='rating').fillna(0)
user_to_movie_sparse_df = csr_matrix(user_to_movie_df.values)
knn_model = NearestNeighbors(metric='cosine', algorithm='brute')
movie_to_user_df = refined_dataset.pivot(
     index='title',
   columns='userId',
      values='rating').fillna(0)
movie_to_user_sparse_df = csr_matrix(movie_to_user_df.values)
movies_list = list(movie_to_user_df.index)
movie_dict = {movie : index for index, movie in enumerate(movies_list)}
case_insensitive_movies_list = [i.lower() for i in movies_list]
knn_movie_model = NearestNeighbors(metric='cosine', algorithm='brute')
knn_movie_model.fit(movie_to_user_sparse_df)

def get_similar_movies(movie, n = 10):
  ## input to this function is the movie and number of top similar movies you want.
    index = movie_dict[movie]
    knn_input = np.asarray([movie_to_user_df.values[index]])
    n = min(len(movies_list)-1,n)
    distances, indices = knn_movie_model.kneighbors(knn_input, n_neighbors=n+1) 
    print("Top",n,"movies which are very much similar to the Movie-",movie, "are: ")
    print(" ")
    for i in range(1,len(distances[0])):
        print(movies_list[indices[0][i]])


movie_name = 'Iron Man (2008)'
get_similar_movies(movie_name,15)

