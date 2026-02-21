# #######################################
# Core Data Models
# #######################################


from pydantic import BaseModel
from typing import List


# ##############################
# Level Model
# ##############################

class Level(BaseModel):
    title: str
    description: str
    topics: List[str]


# ##############################
# Course Roadmap Model
# ##############################

class CourseRoadmap(BaseModel):
    levels: List[Level]