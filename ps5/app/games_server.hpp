// The game store: HTML games the app serves to any browser on the network
// (the PS5's own, a phone, a PC), from the title's games folder.
//
// The games are plain ES5 pages (the PS5 browser renders modern bundles
// blank). AI games talk to the loaded model through /v1/ on the same port,
// passed on to llama-server, so they need neither its address nor CORS.
//
// SPDX-License-Identifier: GPL-3.0-or-later
#pragma once

namespace ps5lm {

// Serves root on port in its own thread, and listens again after the
// network drops. llama_port is where llama-server answers on loopback.
void start_games_server(const char * root, int port, int llama_port);

}  // namespace ps5lm
