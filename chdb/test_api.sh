#!/bin/bash

API_URL="http://localhost:8080/api/v1"

echo "=== Chess Database API Test ==="
echo

echo "1. Health Check:"
curl -s $API_URL/health | jq '.'
echo

echo "2. Import Multiple Games:"
curl -s -X POST $API_URL/games/import \
  -H "Content-Type: application/json" \
  -d '{
    "pgn": "[Event \"London\"]\n[White \"Kasparov, Garry\"]\n[Black \"Kramnik, Vladimir\"]\n[Result \"1-0\"]\n[ECO \"C42\"]\n[WhiteElo \"2849\"]\n[BlackElo \"2770\"]\n\n1.e4 e5 2.Nf3 Nf6 3.Nxe5 d6 4.Nf3 Nxe4 5.d4 d5 6.Bd3 Nc6 7.O-O Be7 8.c4 Nb4 9.Be2 O-O 10.Nc3 Bf5 11.a3 Nxc3 12.bxc3 Nc6 13.Re1 Re8 14.cxd5 Qxd5 15.Bf4 Rac8 16.h3 Be4 17.Nd2 Bg6 18.Bf3 Qd7 19.Nc4 Bf6 20.Qb3 b6 21.a4 Ne7 1-0\n\n\n[Event \"Tata Steel\"]\n[White \"Anand, Viswanathan\"]\n[Black \"Giri, Anish\"]\n[Result \"1/2-1/2\"]\n[ECO \"D37\"]\n[WhiteElo \"2786\"]\n[BlackElo \"2764\"]\n\n1.d4 Nf6 2.c4 e6 3.Nf3 d5 4.Nc3 Be7 5.Bf4 O-O 6.e3 c5 7.dxc5 Bxc5 8.Qc2 Nc6 9.a3 Qa5 10.Rd1 Re8 11.Nd2 e5 12.Bg5 Nd4 13.Qb1 Bf5 14.Bd3 Bxd3 15.Qxd3 Ne2+ 16.Nxe2 Qxd2+ 17.Qxd2 1/2-1/2"
  }' | jq '.'
echo

echo "3. Search by Player (White):"
curl -s "$API_URL/games/search?white=Kasparov&limit=5" | jq '.count, .games[].white'
echo

echo "4. Search by Either Player:"
curl -s "$API_URL/games/search?either=Anand&limit=5" | jq '.count, .games[] | {white, black}'
echo

echo "5. Search by ECO Code:"
curl -s "$API_URL/games/search?eco=C42" | jq '.count, .games[] | {white, black, eco}'
echo

echo "6. Search High-Rated Games:"
curl -s "$API_URL/games/search?min_elo=2750" | jq '.count, .games[] | {white, white_elo, black, black_elo}'
echo

echo "7. Database Statistics:"
curl -s $API_URL/stats | jq '.'
echo

echo "8. Get Specific Game:"
curl -s $API_URL/games/1 | jq '. | {id, white, black, result, eco}'
echo

echo "9. Search with Moves Included:"
curl -s "$API_URL/games/search?white=Kasparov&include_moves=true&limit=1" | jq '.games[0].moves' | head -c 100
echo "..."
echo

echo "=== Test Complete ==="