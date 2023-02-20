#ifndef _TCPSERVER
#define _TCPSERVER
#include <winsock2.h>
#include <ws2tcpip.h>
class TCPServer
{
private:
    SOCKET ClientSocket = INVALID_SOCKET;
    unsigned short port = 27015;
    char errBuf[1024];
public:
    char recBuf[1025];

    TCPServer();
    char* receive();
    void sendData(const char* data, int len);
    void sendMsg(const char*);
    ~TCPServer();

private:

};
#endif
