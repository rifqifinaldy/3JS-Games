FROM nginx:alpine

# Copy all static files into the public serve directory
COPY . /usr/share/nginx/html

# Expose port 80
EXPOSE 80

# Command to run Nginx
CMD ["nginx", "-g", "daemon off;"]
