# #######################################
# Imports
# #######################################

import os
import json
from dotenv import load_dotenv
from openai import OpenAI


# #######################################
# Initialization
# #######################################

load_dotenv()
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


# #######################################
# Core Functions
# #######################################


def generate_summary(text: str):
    # ##############################
    # Prompt Construction
    # ##############################

    prompt = f"""
You are an AI academic planner. 
Analyze the provided material and create a 4-6 level learning roadmap.
Follow the material's logic strictly.

Material:
{text}"""

    # ##############################
    # OpenAI API Call
    # ##############################

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        response_format={ "type": "json_object" },
        messages=[
            {
                "role": "system",
                "content": "You are a helpful assistant designed to output JSON. Structure: {\"levels\": [{\"title\": \"\", \"description\": \"\", \"topics\": []}]}"
            },
            {"role": "user", "content": prompt}
        ],
        temperature=0.2
    )

    # ##############################
    # Response Parsing
    # ##############################

    raw_content = response.choices[0].message.content

    if raw_content is None:
        return {"error": "No content received from AI"}

    try:
        return json.loads(raw_content)
    except json.JSONDecodeError:
        return {"error": "Invalid AI response"}