pipeline {
  agent any

  options {
    // Pipeline-as-code checkout을 명시적으로 수행한다.
    skipDefaultCheckout(true)
    timestamps()
  }

  parameters {
    booleanParam(name: 'DEPLOY_DISCORD', defaultValue: true,
      description: 'Discord Activity(dist-discord / sixer-discord)도 빌드·배포합니다.')
    string(name: 'WEB_PORT', defaultValue: '3000', description: '일반 웹 서버 포트')
    string(name: 'DISCORD_PORT', defaultValue: '3001', description: 'Discord Activity 서버 포트')
  }

  stages {
    stage('Checkout') {
      steps {
        // Jenkins job의 SCM 설정에 연결한 GitHub 저장소/브랜치를 가져온다.
        checkout scm
      }
    }

    stage('Install') {
      steps {
        sh 'npm ci'
      }
    }

    stage('Verify relay') {
      steps {
        sh 'npm run check'
      }
    }

    stage('Build web') {
      steps {
        sh 'npm run build'
      }
    }

    stage('Build Discord Activity') {
      when {
        expression { params.DEPLOY_DISCORD }
      }
      steps {
        // Jenkins Credentials에 Secret text 타입으로 discord-app-id를 등록한다.
        withCredentials([string(credentialsId: 'discord-app-id', variable: 'DISCORD_APP_ID')]) {
          sh 'npm run build:discord'
        }
      }
    }

    stage('Deploy web') {
      steps {
        sh '''
          export PORT="$WEB_PORT"
          if pm2 describe sixer-web >/dev/null 2>&1; then
            pm2 reload sixer-web --update-env
          else
            pm2 start server/index.js --name sixer-web
          fi
          pm2 save
        '''
      }
    }

    stage('Deploy Discord Activity') {
      when {
        expression { params.DEPLOY_DISCORD }
      }
      steps {
        // discord-client-secret도 Secret text 타입으로 등록한다.
        withCredentials([
          string(credentialsId: 'discord-app-id', variable: 'DISCORD_APP_ID'),
          string(credentialsId: 'discord-client-secret', variable: 'DISCORD_CLIENT_SECRET'),
        ]) {
          sh '''
            export PORT="$DISCORD_PORT"
            if pm2 describe sixer-discord >/dev/null 2>&1; then
              pm2 reload sixer-discord --update-env
            else
              pm2 start server/discord.js --name sixer-discord
            fi
            pm2 save
          '''
        }
      }
    }
  }
}
