# Dockerized shibboleth service provider for ECE 391 authorization

How it works TL;DR:
- App is proxy-protected by shibboleth. 
- When they sign in, we store their uid in their session.
- We then redirect them to discord OAuth to get their discord account
- Discord bot gives them a student/TA role depending on if they appear in the class roster

This project was forked from an existing shibboleth authenticator for SIGPwny.
