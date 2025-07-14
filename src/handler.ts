import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { identify } from "./index";
import { IdentifyRequest } from "./types";

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log("Received API Gateway event:", JSON.stringify(event));

  try {
    // Ensure a request body exists before parsing
    if (!event.body) {
      console.error("Error: Request body is missing.");
      return {
        statusCode: 400, // Bad Request
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Request body is required." }),
      };
    }

    const requestBody: IdentifyRequest = JSON.parse(event.body);

    const result = await identify(requestBody);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result),
    };
  } catch (error: any) {
    console.error("Error during identity reconciliation:", error);

    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: error.message || "Internal server error",
      }),
    };
  }
};
