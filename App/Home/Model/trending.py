from math import sqrt
import re
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
def highest_movie():
    ratings = pd.read_csv('ratings.csv')
    
    movies = pd.read_csv('movies.csv')
    df_movies = movies 
    df_ratings = ratings
    merge_movies_rating=pd.merge(df_movies,df_ratings,on='movieId')
    merge_movies_rating=merge_movies_rating.drop('timestamp',axis=1)

    
    ratings_grouped_by_movies = merge_movies_rating.groupby('title').agg([np.mean], np.size)
    ratings_grouped_by_movies = ratings_grouped_by_movies.drop('userId', axis=1)
    highest=ratings_grouped_by_movies['rating']['mean'].sort_values(ascending=False).head(10)
    return highest
    
print(highest_movie())







   
    
    
    

