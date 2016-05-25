FROM node:5.11

MAINTAINER quocnguyen <quocnguyen@clgt.vn>

# Create app directory
RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

# Install NPM
COPY package.json /usr/src/app/
RUN npm install

# Bundle app source
COPY . /usr/src/app

EXPOSE 6969

CMD ["npm","start"]