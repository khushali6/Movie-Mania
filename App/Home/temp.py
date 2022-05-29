from pprint import pprint

def recommender_system(user_id, n_similar_users, n_movies): #, user_to_movie_df, knn_model):
    print("Movie seen by the User:")
    pprint(list(refined_dataset[refined_dataset['userId'] == user_id]['title']))
    print("")

  # def get_similar_users(user, user_to_movie_df, knn_model, n = 5):
    def get_similar_users(user, n = 5):
        knn_input = np.asarray([user_to_movie_df.values[user-1]])
        distances=knn_model.kneighbors(knn_input, n_neighbors=n+1)
        indices = knn_model.kneighbors(knn_input, n_neighbors=n+1)
        print("Top",n,"users who are very much similar to the User-",user, "are: ")
        print(" ")
        for i in range(1,len(distances[0])):
            print(i,". User:", indices[0][i]+1, "separated by distance of",distances[0][i])
            print("")
        return indices.flatten()[1:] + 1, distances.flatten()[1:]


    def filtered_movie_recommendations(n=10):
        first_zero_index = np.where(mean_rating_list == 0)[0][-1]
        sortd_index = np.argsort(mean_rating_list)[::-1]
        sortd_index = sortd_index[:list(sortd_index).index(first_zero_index)]
        n = min(len(sortd_index),n)
        movies_watched = list(refined_dataset[refined_dataset['userId'] == user_id]['title'])
        filtered_movie_list = list(movies_list[sortd_index])
        count = 0
        final_movie_list = []
        for i in filtered_movie_list:
            if i not in movies_watched:
                count+=1
                final_movie_list.append(i)
            if count == n:
                break
        if count == 0:
            print("There are no movies left which are not seen by the input users and seen by similar users. May be increasing the number of similar users who are to be considered may give a chance of suggesting an unseen good movie.")
        else:
            pprint(final_movie_list)

    similar_user_list, distance_list = get_similar_users(user_id,n_similar_users)
    weightage_list = distance_list/np.sum(distance_list)
    mov_rtngs_sim_users = user_to_movie_df.values[similar_user_list]
    movies_list = user_to_movie_df.columns
    weightage_list = weightage_list[:,np.newaxis] + np.zeros(len(movies_list))
    new_rating_matrix = weightage_list*mov_rtngs_sim_users
    mean_rating_list = new_rating_matrix.sum(axis =0)
    print("")
    print("Movies recommended based on similar users are: ")
    print("")
    filtered_movie_recommendations(n_movies)