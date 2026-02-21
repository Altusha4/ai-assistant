import os
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

api_key = os.getenv("OPENAI_API_KEY")

if not api_key:
    raise ValueError("OPENAI_API_KEY not found in environment variables")

client = OpenAI(api_key=api_key)


def generate_summary(text: str) -> str:
    prompt = f"""
    Ты — академический помощник.
    Составь структурированный конспект по следующему материалу.

    Материал:
    {text}

    Требования:
    - Чёткая структура
    - Заголовки
    - Краткие пункты
    - Без воды
    """

    response = client.chat.completions.create(
        model="gpt-4o-mini",  # быстрая и экономичная модель
        messages=[
            {"role": "system", "content": "Ты профессиональный академический помощник."},
            {"role": "user", "content": prompt}
        ],
        temperature=0.4
    )

    return response.choices[0].message.content