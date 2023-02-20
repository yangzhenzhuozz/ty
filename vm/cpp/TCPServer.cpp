#include "../hpp/TCPServer.hpp"
#include <iostream>
#pragma comment(lib,"ws2_32.lib")
TCPServer::TCPServer() :recBuf{ 0 }
{
    WSADATA wsaData;
    auto iResult = WSAStartup(MAKEWORD(2, 2), &wsaData);
    if (iResult != 0) {
        std::cerr << "WSAStartup 失败:" << iResult << std::endl;
        return;
    }

    SOCKET ListenSocket = socket(AF_INET, SOCK_STREAM, 0);
    if (ListenSocket == INVALID_SOCKET) {
        std::cerr << "socket failed with error:" << WSAGetLastError() << std::endl;
        WSACleanup();
        return;
    }

    sockaddr_in serviceAddress = { 0 };
    serviceAddress.sin_family = AF_INET;
    serviceAddress.sin_port = htons(port);
    inet_pton(AF_INET, "0.0.0.0", &serviceAddress.sin_addr);

    bind(ListenSocket, (SOCKADDR*)&serviceAddress, sizeof(SOCKADDR));
    listen(ListenSocket, 1);

    SOCKADDR_IN clientsocketAdd = { 0 };
    int addrlen = sizeof(SOCKADDR);

    std::cout << "wait for debugger connecting" << std::endl;
    ClientSocket = accept(ListenSocket, (SOCKADDR*)&clientsocketAdd, &addrlen);
    std::cout << "debugger connected" << std::endl;
    if (ClientSocket == INVALID_SOCKET) {
        std::cerr << "socket initiate failed with error: " << WSAGetLastError() << std::endl;
        closesocket(ListenSocket);
        WSACleanup();
    }
    else
    {
        closesocket(ListenSocket);//一旦有一个连接到达，则不再接收其他连接，直接关闭ListenSocket
    }
}

char* TCPServer::receive()
{
    if (ClientSocket == INVALID_SOCKET) {
        std::cerr << "debugger socket is invalid" << std::endl;
        return nullptr;
    }
    else {
        int msgLength = 0;
        int maxLength = 50;
        for (;;) {
            int recLen = recv(ClientSocket, (char*)&msgLength, sizeof(msgLength), 0);
            if (recLen == SOCKET_ERROR) {
                snprintf(errBuf, sizeof(errBuf), "debugger socket receive error:%d", WSAGetLastError());
                throw errBuf;
            }
            else if (recLen == 0) {
                snprintf(errBuf, sizeof(errBuf), "debugger socket has closed");
                throw errBuf;
            }
            else
            {
                if (msgLength > maxLength) {
                    snprintf(errBuf, sizeof(errBuf), "command length more than %d", maxLength);
                    //throw errBuf;
                }
                else
                {
                    int receivedLength = 0;
                    for (; msgLength != receivedLength;)
                    {
                        recLen = recv(ClientSocket, recBuf + receivedLength, msgLength - receivedLength, 0);
                        if (recLen == SOCKET_ERROR) {
                            snprintf(errBuf, sizeof(errBuf), "debugger socket receive error:%d", WSAGetLastError());
                            throw errBuf;
                        }
                        else
                        {
                            receivedLength += recLen;
                        }
                    }
                    recBuf[receivedLength] = '\0';
                    return recBuf;
                }
            }
        }
    }
}

void TCPServer::sendMsg(const char* msg) {
    sendData(msg, (int)strlen(msg));
}

void TCPServer::sendData(const char* data, int dataLen)
{
    if (ClientSocket == INVALID_SOCKET) {
        std::cerr << "debugger socket is invalid" << std::endl;
    }
    else
    {
        int iSendResult = send(ClientSocket, (char*)&dataLen, sizeof(dataLen), 0);
        if (iSendResult == SOCKET_ERROR) {
            snprintf(errBuf, sizeof(errBuf), "debugger socket send error:%d", WSAGetLastError());
            throw errBuf;
        }
        iSendResult = send(ClientSocket, data, dataLen, 0);
        if (iSendResult == SOCKET_ERROR) {
            snprintf(errBuf, sizeof(errBuf), "debugger socket send error:%d", WSAGetLastError());
            throw errBuf;
        }
    }
}

TCPServer::~TCPServer()
{
    auto iResult = shutdown(ClientSocket, SD_SEND);
    if (iResult == SOCKET_ERROR) {
        std::cerr << "shutdown failed with error: " << WSAGetLastError() << std::endl;
    }
    closesocket(ClientSocket);
    WSACleanup();
}