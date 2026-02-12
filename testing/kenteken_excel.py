#!/usr/bin/env python3
"""
This application reads a Excel file.
From this file it reads the sheet "Deelnemers"
From this sheet it reads the columns "Deelname-ID" and "Kenteken" and makes this an dictionary
There are 2 columns in the sheet "Kenteken" so only the one with data is used
"""

# https://manager.congressus.nl/events/125053/export

import json
import sys

import httpx
import pandas as pd

# Get current working directory of the script
working_directory = __file__.rsplit("/", 1)[0]
# print(f"Working directory: {working_directory}")

# Get scriptname
script_name = __file__.rsplit("/", 1)[-1].split(".")[0]

api_access_key = open(f"{working_directory}/../source/api-key-2.txt").read().strip()

# print(f"Using API key: #{api_access_key}#")

# Specify the event ID as argument
if len(sys.argv) != 2:
    print(f"Usage: {script_name}.py <event_id>")
    sys.exit(1)
event_id = sys.argv[1]

page = 1
next_page = True

headers = {"Authorization": f"Bearer {api_access_key}"}
url = f"https://manager.congressus.nl/events/{event_id}/export"
data = []


def main():
    params = {}
    resp = httpx.get(url, params=params, headers=headers, timeout=10)
    """
    resp.status_code	Geeft alleen het getal (bijv. 200, 404, 500).
    resp.text	De volledige inhoud van de pagina als tekst (string).
    resp.json()	Vertaalt de inhoud direct naar een Python dictionary (als het een API-antwoord is).
    resp.headers	Laat je de headers zien die de server heeft teruggestuurd.
    resp.is_success	Een simpele True of False of de aanvraag gelukt is.
    """
    print(resp.headers)
    exit()

    # Read the Excel file
    df = pd.read_excel("deelnemers.xlsx", sheet_name="Deelnemers")

    # Create a dictionary from the columns "Deelname-ID" and "Kenteken"
    deelnemers_dict = {}
    for _, row in df.iterrows():
        deelname_id = row["Deelname-ID"]
        if pd.isna(deelname_id):  # Skip rows where 'Deelname-ID' is NaN
            print("Warning: Skipping row with NaN 'Deelname-ID'")
            continue
        else:
            deelname_id = str(
                int(deelname_id)
            )  # Convert Deelname-ID to string for consistent dictionary keys
        kenteken = row["Kenteken"]
        if pd.isna(kenteken):  # If the first 'Kenteken' is NaN, check the second one
            kenteken = row[
                "Kenteken:"
            ]  # Assuming the second 'Kenteken' column is named 'Kenteken.1'
        if pd.notna(kenteken):  # Check if kenteken is not NaN
            kenteken = normalize_kenteken(kenteken)  # Normalize the kenteken
            deelnemers_dict[deelname_id] = kenteken
        else:
            print(f"Warning: No valid 'Kenteken' found for Deelname-ID {deelname_id}")

    print(json.dumps(deelnemers_dict, indent=4))


def normalize_kenteken(kenteken):
    # Remove spaces and convert to uppercase
    kenteken = kenteken.replace(" ", "").upper()

    # Add a dash when changing from letters to numbers or vice versa
    normalized = kenteken[0]  # Start with the first character
    for i in range(1, len(kenteken)):
        if (kenteken[i - 1].isalpha() and kenteken[i].isdigit()) or (
            kenteken[i - 1].isdigit() and kenteken[i].isalpha()
        ):
            normalized += "-"
        normalized += kenteken[i]
    kenteken = normalized

    # Add dash if length is 7 and there is a group of 4 of the same type and containing 1 dash
    if len(kenteken) == 7 and kenteken.count("-") == 1:
        parts = kenteken.split("-")
        if len(parts) == 2:
            if len(parts[0]) == 4:
                kenteken = parts[0][:2] + "-" + parts[0][2:] + "-" + parts[1]
            elif len(parts[1]) == 4:
                kenteken = parts[0] + "-" + parts[1][:2] + "-" + parts[1][2:]

    return kenteken


if __name__ == "__main__":
    main()
