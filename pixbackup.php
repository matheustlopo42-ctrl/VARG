<?php
error_reporting(0);
ini_set('display_errors', 0);
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

$input = json_decode(file_get_contents('php://input'), true);
$amount_cents = intval($input['amount'] ?? 3990);
$valor = $amount_cents / 100;

$token = "pk_a11c371cd9771d6c91e5211016d350e15f349161f001754109a8eb0a2e92233b";
$endpoint = "https://pixgo.org/api/v1/payment/create";

$payload = json_encode([
    "amount"      => $valor,
    "description" => "Pedido VARG",
    "external_id" => "VARG_" . time()
]);

$ch = curl_init($endpoint);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => $payload,
    CURLOPT_HTTPHEADER     => [
        "Content-Type: application/json",
        "X-API-Key: $token"
    ],
    CURLOPT_SSL_VERIFYPEER => false,
    CURLOPT_SSL_VERIFYHOST => false,
    CURLOPT_CONNECTTIMEOUT => 15,
    CURLOPT_TIMEOUT        => 30
]);

$response = curl_exec($ch);
$curl_error = curl_error($ch);
$http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($response === false) {
    echo json_encode(["error" => "Falha na conexão: $curl_error"]);
    exit;
}

$data = json_decode($response, true);

if ($data === null) {
    echo json_encode(["error" => "Resposta inválida da API", "raw" => substr($response, 0, 300)]);
    exit;
}

if (!empty($data['success']) && !empty($data['data'])) {
    echo json_encode([
        "success"  => true,
        "qr_image" => $data['data']['qr_image_url'] ?? '',
        "pix_code" => $data['data']['qr_code']      ?? ''
    ]);
} else {
    $msg = $data['message'] ?? $data['error'] ?? "Erro desconhecido (HTTP $http_code)";
    echo json_encode(["error" => $msg, "raw" => $data]);
}