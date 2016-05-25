
# uptime

![uptime](http://i.imgur.com/BeQPT6K.gif)


`uptime` will watch your websites while you sleep.
Writen in nodejs, backed by leveldb and can easy deploy using docker.

It will send you only one email to notify when your site went down. Only one.

Pull requests are always welcome.

### Some ideas for pull request:
- Send SMS to notify. ( i am so lazy to check my email )
- Slack
- Login/Register to management all sites easily.

## Installation

`uptime` only requires nodejs.

```
$ git clone git://github.com/quocnguyen/uptime.git
$ cd uptime
$ cp .env-sample .env
$ npm install
```

Start the application with
```
npm start
```

## Config

you can config your app using the environment variables in `.env` file.

| KEY  | MEAN | DEFAULT |
| ------------- | ------------- | ------------- |
| PORT  | the port uptime will listen on  | 3001 |
| DB  | folder where uptime store database  | ./db |
| VIRTUAL_DOMAIN | your domain | localhost:3001 |
| USER_AGENT | user agent use when sending request | |
| SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD | for sending email | |
| INTERVAL | delay between each check | 5 minutes | |

## Quick Start: Running uptime in a Docker Container

To quickly tryout uptime on your machine with Docker, I have a Docker image that includes everything you need to get started. Simply run:

```
sudo docker run \
  -e DB=./db \
  -e PORT=6969 \
  -e DOMAIN=http://localhost:6969 \
  --volume=/my/own/datadir:/usr/src/app/db:rw \
  --publish=3000:6969 \
  --detach=true \
  --name=uptime \
  quocnguyen/uptime:latest
```

The `--volume /my/own/datadir:/usr/src/app/db` part of the command mounts the /my/own/datadir directory from the underlying host system as /usr/src/app/db inside the container, where uptime by default will write its data files.

Note that users on host systems with SELinux enabled may see issues with this. The current workaround is to assign the relevant SELinux policy type to the new data directory so that the container will be allowed to access it:

```
$ chcon -Rt svirt_sandbox_file_t /my/own/datadir
```

## More Image

Here is some images so you can guess how it work.

### Debug
![uptime debug](http://i.imgur.com/HZ8dbNS.png)

### Performance chart
![uptime performance chart](http://i.imgur.com/FalZqmb.png)


# License

MIT

