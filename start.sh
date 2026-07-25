docker stop potluck
docker rm potluck
docker build -t potluck .
docker run -d --name potluck -p 20129:20129 --env-file .env -v potluck-data:/app/data potluck
