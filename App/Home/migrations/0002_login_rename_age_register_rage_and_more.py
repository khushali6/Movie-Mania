# Generated by Django 4.0.4 on 2022-05-19 05:44

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('Home', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='Login',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('lname', models.CharField(max_length=50)),
                ('lemail', models.CharField(max_length=50)),
                ('lpwd', models.CharField(max_length=10)),
            ],
        ),
        migrations.RenameField(
            model_name='register',
            old_name='age',
            new_name='rage',
        ),
        migrations.RenameField(
            model_name='register',
            old_name='email',
            new_name='remail',
        ),
        migrations.RenameField(
            model_name='register',
            old_name='name',
            new_name='rname',
        ),
        migrations.RenameField(
            model_name='register',
            old_name='password',
            new_name='rpassword',
        ),
    ]
