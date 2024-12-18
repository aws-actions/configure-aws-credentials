# Code Citations

## License: MIT
https://github.com/sendgrid/sendgrid-nodejs/tree/b8125d86134157a462c2e24816cfa56677ab76a8/docs/examples/webhooks-docker/Dockerfile

```
src/app
COPY ["package.json", "package-lock.json*", "npm-shrinkwrap.json*", "./"]
RUN npm install --production --silent && mv node_modules ../
COPY . .
EXPOSE 3000
```


## License: unknown
https://github.com/oacostam/villacaribe/tree/9734f063175fbff1f42e3fe37a8c98211160d7c2/Dockerfile

```
package.json", "package-lock.json*", "npm-shrinkwrap.json*", "./"]
RUN npm install --production --silent && mv node_modules ../
COPY . .
EXPOSE 3000
RUN chown -R node /
```


## License: unknown
https://github.com/earthly/website/tree/18a9301748cd9d51174e773f162ae5c245ccfc0b/blog/_posts/2022-10-31-how-to-use-docker-in-vscode.md

```
"npm-shrinkwrap.json*", "./"]
RUN npm install --production --silent && mv node_modules ../
COPY . .
EXPOSE 3000
RUN chown -R node /usr/src/app
USER node
CMD ["node", "
```


## License: unknown
https://github.com/bityos/faceDetectionApp/tree/4a40e7040a39b93b3cd995392ad91b06415c922f/Dockerfile

```
"package.json", "package-lock.json*", "npm-shrinkwrap.json*", "./"]
RUN npm install --production --silent && mv node_modules ../
COPY . .
EXPOSE 3000
RUN chown -R node
```


## License: MIT
https://github.com/aws-actions/configure-aws-credentials/tree/010d0da01d0b5a38af31e9c3470dbfdabdecca3a/.github/workflows/tests-integ.yml

```
access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          role-to-assume: ${{ secrets.SECRETS_AWS_ROLE_TO_ASSUME }}
          role-session-name: IntegAccessKeysAssumeRole
          role-external-
```

