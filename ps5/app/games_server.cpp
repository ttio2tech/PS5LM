// SPDX-License-Identifier: GPL-3.0-or-later
#include "games_server.hpp"

#include <cpp-httplib/httplib.h>

#include <pthread.h>

#include <cerrno>
#include <chrono>
#include <cstdio>
#include <string>
#include <thread>

namespace ps5lm {

namespace {

struct GamesServer {
    std::string root;
    int         port       = 0;
    int         llama_port = 0;
};

const char * kOffline = R"({"error":{"message":"No model is loaded. Load one on the PS5 first."}})";

// One request passed on to llama-server, whole (no streaming): the games ask
// for short answers, and a plain reply is what an ES5 page reads best.
void pass_on(const GamesServer & g, const httplib::Request & req, httplib::Response & res) {
    httplib::Client llama("127.0.0.1", g.llama_port);
    llama.set_connection_timeout(2, 0);
    llama.set_read_timeout(180, 0);
    llama.set_write_timeout(10, 0);
    // A set Expect keeps httplib from adding "Expect: 100-continue" to bodies
    // over 1 KiB, which costs a round trip, or a second's wait for a server
    // that does not answer it, on every turn of a conversation.
    const httplib::Headers headers = { { "Expect", "" } };
    httplib::Result r = req.method == "POST"
                            ? llama.Post(req.path, headers, req.body, req.get_header_value("Content-Type", "application/json"))
                            : llama.Get(req.path);
    if (!r) {
        res.status = 503;
        res.set_content(kOffline, "application/json");
        return;
    }
    res.status = r->status;
    res.set_content(r->body, r->get_header_value("Content-Type", "application/json"));
}

void * serve(void * arg) {
    const GamesServer & g = *static_cast<GamesServer *>(arg);
    httplib::Server svr;
    if (!svr.set_mount_point("/", g.root)) {
        std::printf("ps5lm-app: games: no folder %s\n", g.root.c_str());
        return nullptr;
    }
    svr.set_file_extension_and_mimetype_mapping("json", "application/json");
    svr.set_file_extension_and_mimetype_mapping("svg", "image/svg+xml");
    // The PS5 browser keeps pages it has cached; a new app version brings new games.
    svr.set_post_routing_handler([](const httplib::Request &, httplib::Response & res) {
        res.set_header("Cache-Control", "no-cache");
    });
    // Only what a game needs: chat completions, and whether a model is up.
    auto llama = [&g](const httplib::Request & req, httplib::Response & res) { pass_on(g, req, res); };
    svr.Post("/v1/chat/completions", llama);
    svr.Get("/health", llama);
    svr.Get("/v1/models", llama);

    // As patches/0005 does for llama-server: when the network drops, accept()
    // fails, httplib closes the socket, and nothing could reach the games.
    for (;;) {
        while (!svr.bind_to_port("0.0.0.0", g.port)) {
            std::this_thread::sleep_for(std::chrono::seconds(1));
        }
        std::printf("ps5lm-app: games on port %d\n", g.port);
        svr.listen_after_bind();
        std::printf("ps5lm-app: games listener stopped (errno %d); listening again\n", errno);
        std::this_thread::sleep_for(std::chrono::seconds(1));
        svr.stop();  // clears the failed state; the socket is closed already
    }
    return nullptr;
}

}  // namespace

void start_games_server(const char * root, int port, int llama_port) {
    auto * g = new GamesServer{ root, port, llama_port };  // lives as long as the app
    pthread_attr_t attr;
    pthread_attr_init(&attr);
    pthread_attr_setstacksize(&attr, 1u << 20);  // the console's default stack is small
    pthread_t thread;
    pthread_create(&thread, &attr, serve, g);
    pthread_detach(thread);
}

}  // namespace ps5lm
