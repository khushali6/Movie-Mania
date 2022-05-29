from django.db import models

# Create your models here.
class Register(models.Model):
    rid=models.AutoField
    rname=models.CharField(max_length=50)
    remail=models.CharField(max_length=50)
    rage=models.IntegerField()
    rpassword=models.CharField(max_length=10)
    def __str__(self):
        return self.rname

class Login(models.Model):
    lid = models.AutoField
    lname = models.CharField(max_length=50)
    lemail=models.CharField(max_length=50)
    lpwd = models.CharField(max_length=10)
    


    def __str__(self):
        return self.lname






