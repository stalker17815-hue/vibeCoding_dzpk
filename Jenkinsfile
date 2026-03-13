// ==================== 全局变量配置 ====================
// Git 配置
def GIT_REPO = 'git@github.com:Deemo12138/vibeCoding_dzpk.git'
def GIT_BRANCH = 'master'
def GIT_CREDENTIALS_ID = 'github-ssh-key'

// Docker 镜像配置
def CLIENT_IMAGE_NAME = 'dzpk-client'
def SERVER_IMAGE_NAME = 'dzpk-server'
def DOCKER_IMAGE_TAG = 'latest'

// 云服务器配置
def CLOUD_SERVER_HOST = '8.137.49.164'
def CLOUD_SERVER_USER = 'root'

// 端口配置
def CLIENT_PORT = '5173'   // 前端端口
def SERVER_PORT = '3001'   // 后端 Socket.io 端口

// 构建产物路径
def TEMP_CLIENT_IMAGE_PATH = "/tmp/${CLIENT_IMAGE_NAME}.tar"
def TEMP_SERVER_IMAGE_PATH = "/tmp/${SERVER_IMAGE_NAME}.tar"

// Docker 网络
def DOCKER_NETWORK = 'dzpk-network'

// 日志保留天数
def BUILD_HISTORY = '10'

// 项目名称
def PROJECT_NAME = "德州扑克游戏"

// ===================================================

pipeline {
    agent any

    options {
        buildDiscarder(logRotator(numToKeepStr: BUILD_HISTORY))
        skipDefaultCheckout()
    }

    stages {
        stage('清理工作区') {
            steps {
                echo '清理工作区...'
                cleanWs()
            }
        }

        stage('拉取GitHub代码') {
            steps {
                echo "开始拉取代码: ${GIT_REPO} (${GIT_BRANCH})"
                git branch: GIT_BRANCH,
                    credentialsId: GIT_CREDENTIALS_ID,
                    url: GIT_REPO
                echo '代码拉取成功'
            }
        }

        stage('构建客户端Docker镜像') {
            steps {
                echo "开始构建客户端 Docker 镜像: ${CLIENT_IMAGE_NAME}:${DOCKER_IMAGE_TAG}"
                sh "docker build -t ${CLIENT_IMAGE_NAME}:${DOCKER_IMAGE_TAG} -f client/Dockerfile ./client"
                echo '客户端 Docker 镜像构建成功'
            }
        }

        stage('构建服务端Docker镜像') {
            steps {
                echo "开始构建服务端 Docker 镜像: ${SERVER_IMAGE_NAME}:${DOCKER_IMAGE_TAG}"
                sh "docker build -t ${SERVER_IMAGE_NAME}:${DOCKER_IMAGE_TAG} -f server/Dockerfile ./server"
                echo '服务端 Docker 镜像构建成功'
            }
        }

        stage('传输镜像到云服务器') {
            steps {
                echo "保存镜像到临时文件..."
                sh "docker save ${CLIENT_IMAGE_NAME}:${DOCKER_IMAGE_TAG} -o ${TEMP_CLIENT_IMAGE_PATH}"
                sh "docker save ${SERVER_IMAGE_NAME}:${DOCKER_IMAGE_TAG} -o ${TEMP_SERVER_IMAGE_PATH}"
                echo "传输镜像到云服务器: ${CLOUD_SERVER_USER}@${CLOUD_SERVER_HOST}"
                sh "scp -o StrictHostKeyChecking=no ${TEMP_CLIENT_IMAGE_PATH} ${CLOUD_SERVER_USER}@${CLOUD_SERVER_HOST}:/tmp/"
                sh "scp -o StrictHostKeyChecking=no ${TEMP_SERVER_IMAGE_PATH} ${CLOUD_SERVER_USER}@${CLOUD_SERVER_HOST}:/tmp/"
                echo '镜像传输成功'
            }
        }

        stage('部署到云服务器') {
            steps {
                echo "在云服务器上部署..."
                sh """
                    # 创建 Docker 网络（如果不存在）
                    ssh -o StrictHostKeyChecking=no ${CLOUD_SERVER_USER}@${CLOUD_SERVER_HOST} 'docker network create ${DOCKER_NETWORK} 2>/dev/null || true'

                    # 停止并删除旧容器
                    ssh -o StrictHostKeyChecking=no ${CLOUD_SERVER_USER}@${CLOUD_SERVER_HOST} 'docker stop ${CLIENT_IMAGE_NAME} ${SERVER_IMAGE_NAME} || true'
                    ssh -o StrictHostKeyChecking=no ${CLOUD_SERVER_USER}@${CLOUD_SERVER_HOST} 'docker rm ${CLIENT_IMAGE_NAME} ${SERVER_IMAGE_NAME} || true'

                    # 加载新镜像
                    ssh -o StrictHostKeyChecking=no ${CLOUD_SERVER_USER}@${CLOUD_SERVER_HOST} 'docker load -i /tmp/${CLIENT_IMAGE_NAME}.tar'
                    ssh -o StrictHostKeyChecking=no ${CLOUD_SERVER_USER}@${CLOUD_SERVER_HOST} 'docker load -i /tmp/${SERVER_IMAGE_NAME}.tar'

                    # 启动服务端容器
                    ssh -o StrictHostKeyChecking=no ${CLOUD_SERVER_USER}@${CLOUD_SERVER_HOST} \\
                        'docker run -d --name ${SERVER_IMAGE_NAME} \\
                        --network ${DOCKER_NETWORK} \\
                        -p ${SERVER_PORT}:3001 \\
                        --restart unless-stopped \\
                        ${SERVER_IMAGE_NAME}:${DOCKER_IMAGE_TAG}'

                    # 启动客户端容器
                    ssh -o StrictHostKeyChecking=no ${CLOUD_SERVER_USER}@${CLOUD_SERVER_HOST} \\
                        'docker run -d --name ${CLIENT_IMAGE_NAME} \\
                        --network ${DOCKER_NETWORK} \\
                        -p ${CLIENT_PORT}:80 \\
                        --restart unless-stopped \\
                        ${CLIENT_IMAGE_NAME}:${DOCKER_IMAGE_TAG}'

                    # 清理临时文件
                    ssh -o StrictHostKeyChecking=no ${CLOUD_SERVER_USER}@${CLOUD_SERVER_HOST} 'rm -f /tmp/${CLIENT_IMAGE_NAME}.tar /tmp/${SERVER_IMAGE_NAME}.tar'
                """
                echo '部署成功'
            }
        }

        stage('验证部署') {
            steps {
                echo "验证部署状态..."
                sh "ssh -o StrictHostKeyChecking=no ${CLOUD_SERVER_USER}@${CLOUD_SERVER_HOST} 'docker ps | grep -E \"${CLIENT_IMAGE_NAME}|${SERVER_IMAGE_NAME}\"'"
                sh "ssh -o StrictHostKeyChecking=no ${CLOUD_SERVER_USER}@${CLOUD_SERVER_HOST} 'docker logs --tail 10 ${SERVER_IMAGE_NAME}'"
                echo '部署验证完成'
            }
        }
    }

    post {
        success {
            echo "【${PROJECT_NAME}】云端部署成功！"
            echo "前端访问地址: http://${CLOUD_SERVER_HOST}:${CLIENT_PORT}"
            echo "后端 Socket.io 端口: ${CLOUD_SERVER_HOST}:${SERVER_PORT}"
        }
        failure {
            echo "【${PROJECT_NAME}】云端部署失败！"
        }
        always {
            sh "rm -f ${TEMP_CLIENT_IMAGE_PATH} ${TEMP_SERVER_IMAGE_PATH} || true"
        }
    }
}
